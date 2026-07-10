import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  cpSync,
  statSync,
} from "node:fs";
import { resolve, basename } from "node:path";
import {
  readSkillStore,
  writeSkillStore,
  searchSkills,
} from "./storage.js";
import type { SkillMeta, SkillStore } from "./storage.js";

export type { SkillMeta } from "./storage.js";

/**
 * Parse YAML-like frontmatter from SKILL.md content.
 * Handles the simple key: value format used in SKILL.md files.
 */
function parseFrontmatter(content: string): { name: string; description: string } {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
  };
}

/**
 * Convert a name to a filesystem-safe slug.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export class SkillsEngine {
  private store: SkillStore;
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.store = readSkillStore();
    this.reload();
  }

  /** Reload from disk: scan .pi/skills/ and reconcile with in-memory store. */
  reload(): void {
    if (!existsSync(this.skillsDir)) {
      this.store.skills = [];
      return;
    }

    const entries = readdirSync(this.skillsDir, { withFileTypes: true });
    const diskSlugs = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      diskSlugs.add(slug);

      const skillFile = resolve(this.skillsDir, slug, "SKILL.md");
      const disabledFile = resolve(this.skillsDir, slug, "SKILL.md.disabled");

      const isEnabled = existsSync(skillFile);
      const mdFile = isEnabled ? skillFile : disabledFile;

      if (!existsSync(mdFile)) continue;

      // Check if already in store
      const existing = this.store.skills.find((s) => s.slug === slug);
      if (existing) {
        // Update enabled status from disk
        existing.enabled = isEnabled;
        continue;
      }

      // New skill found on disk, register it
      try {
        const content = readFileSync(mdFile, "utf-8");
        const { name, description } = parseFrontmatter(content);
        const stat = statSync(resolve(this.skillsDir, slug));
        const meta: SkillMeta = {
          slug,
          name: name || slug,
          description: description || "",
          source: "manual", // Discovered from disk, assume manual
          enabled: isEnabled,
          installedAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        };
        this.store.skills.push(meta);
      } catch {
        // Skip directories we can't read
      }
    }

    // Remove store entries that no longer exist on disk
    this.store.skills = this.store.skills.filter((s) => diskSlugs.has(s.slug));

    this.save();
  }

  /** List all registered skills. */
  list(): SkillMeta[] {
    return [...this.store.skills];
  }

  /** Get a single skill's metadata + full SKILL.md content. */
  get(
    slug: string
  ): { meta: SkillMeta; content: string } | null {
    const meta = this.store.skills.find((s) => s.slug === slug);
    if (!meta) return null;

    const mdFile = meta.enabled ? "SKILL.md" : "SKILL.md.disabled";
    const skillPath = resolve(this.skillsDir, slug, mdFile);

    if (!existsSync(skillPath)) return null;

    const content = readFileSync(skillPath, "utf-8");
    return { meta: { ...meta }, content };
  }

  /**
   * Install a skill from an external directory.
   * The source directory must contain a SKILL.md file.
   */
  install(sourcePath: string): SkillMeta {
    const resolvedSource = resolve(sourcePath);

    if (!existsSync(resolvedSource)) {
      throw new Error(`Source path does not exist: ${resolvedSource}`);
    }

    const srcSkillFile = resolve(resolvedSource, "SKILL.md");
    if (!existsSync(srcSkillFile)) {
      throw new Error(
        `Source directory must contain a SKILL.md file: ${resolvedSource}`
      );
    }

    // Parse frontmatter to get name/description
    const content = readFileSync(srcSkillFile, "utf-8");
    const { name, description } = parseFrontmatter(content);
    const slug = slugify(name) || slugify(basename(resolvedSource));

    // Check for conflicts
    const destDir = resolve(this.skillsDir, slug);
    if (existsSync(destDir)) {
      throw new Error(
        `Skill "${slug}" already exists. Delete it first or use a different name.`
      );
    }

    // Copy the entire directory
    cpSync(resolvedSource, destDir, { recursive: true });

    const stat = statSync(destDir);
    const meta: SkillMeta = {
      slug,
      name: name || slug,
      description: description || "",
      source: "manual",
      enabled: true,
      installedAt: new Date().toISOString(),
      updatedAt: stat.mtime.toISOString(),
      originPath: resolvedSource,
    };

    // Remove any previous entry with same slug (shouldn't happen but be safe)
    this.store.skills = this.store.skills.filter((s) => s.slug !== slug);
    this.store.skills.push(meta);
    this.save();

    return meta;
  }

  /** Delete a skill directory and remove from store. */
  delete(slug: string): boolean {
    const meta = this.store.skills.find((s) => s.slug === slug);
    if (!meta) return false;

    const skillDir = resolve(this.skillsDir, slug);
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true });
    }

    this.store.skills = this.store.skills.filter((s) => s.slug !== slug);
    this.save();
    return true;
  }

  /** Enable a skill: rename SKILL.md.disabled → SKILL.md */
  enable(slug: string): boolean {
    const meta = this.store.skills.find((s) => s.slug === slug);
    if (!meta) return false;

    const disabledFile = resolve(this.skillsDir, slug, "SKILL.md.disabled");
    const skillFile = resolve(this.skillsDir, slug, "SKILL.md");

    if (!existsSync(disabledFile)) {
      // Already enabled or no file exists
      return existsSync(skillFile);
    }

    try {
      renameSync(disabledFile, skillFile);
      meta.enabled = true;
      meta.updatedAt = new Date().toISOString();
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  /** Disable a skill: rename SKILL.md → SKILL.md.disabled */
  disable(slug: string): boolean {
    const meta = this.store.skills.find((s) => s.slug === slug);
    if (!meta) return false;

    const skillFile = resolve(this.skillsDir, slug, "SKILL.md");
    const disabledFile = resolve(this.skillsDir, slug, "SKILL.md.disabled");

    if (!existsSync(skillFile)) {
      // Already disabled or no file exists
      return existsSync(disabledFile);
    }

    try {
      renameSync(skillFile, disabledFile);
      meta.enabled = false;
      meta.updatedAt = new Date().toISOString();
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  /** Full-text search across name, description, and slug. */
  search(query: string): Array<{ meta: SkillMeta; snippet: string }> {
    const matched = searchSkills(this.store, query);
    return matched.map((meta) => ({
      meta,
      snippet: meta.description.slice(0, 120),
    }));
  }

  /**
   * Register a newly auto-generated skill.
   * Called by the skill hook after SkillGenerator writes the SKILL.md.
   */
  registerAutoGenerated(
    slug: string,
    meta: { name: string; description: string }
  ): void {
    // Remove any existing entry with the same slug
    this.store.skills = this.store.skills.filter((s) => s.slug !== slug);

    const skillDir = resolve(this.skillsDir, slug);
    const stat = existsSync(skillDir) ? statSync(skillDir) : null;

    const skillMeta: SkillMeta = {
      slug,
      name: meta.name,
      description: meta.description,
      source: "auto",
      enabled: true,
      installedAt: stat?.birthtime.toISOString() ?? new Date().toISOString(),
      updatedAt: stat?.mtime.toISOString() ?? new Date().toISOString(),
    };

    this.store.skills.push(skillMeta);
    this.save();
  }

  /** Get statistics about installed skills. */
  getStats(): { total: number; enabled: number; auto: number; manual: number } {
    const total = this.store.skills.length;
    const enabled = this.store.skills.filter((s) => s.enabled).length;
    const auto = this.store.skills.filter((s) => s.source === "auto").length;
    const manual = this.store.skills.filter((s) => s.source === "manual").length;
    return { total, enabled, auto, manual };
  }

  private save(): void {
    writeSkillStore(this.store);
  }
}
