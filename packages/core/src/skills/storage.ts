import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.js";

export interface SkillMeta {
  slug: string;
  name: string;
  description: string;
  source: "auto" | "manual";
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  originPath?: string;
}

export interface SkillStore {
  version: number;
  skills: SkillMeta[];
}

const SKILLS_PATH = resolve(DATA_DIR, "skills.json");

function emptyStore(): SkillStore {
  return { version: 1, skills: [] };
}

export function readSkillStore(): SkillStore {
  if (!existsSync(SKILLS_PATH)) return emptyStore();
  try {
    return JSON.parse(readFileSync(SKILLS_PATH, "utf-8")) as SkillStore;
  } catch {
    return emptyStore();
  }
}

export function writeSkillStore(store: SkillStore): void {
  writeFileSync(SKILLS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function searchSkills(
  store: SkillStore,
  query: string
): SkillMeta[] {
  const lower = query.toLowerCase();
  return store.skills.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.slug.toLowerCase().includes(lower)
  );
}
