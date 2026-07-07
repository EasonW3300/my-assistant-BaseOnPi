import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export interface SkillGenerateInput {
  topic: string;
  category: string;
  history: string;
}

export class SkillGenerator {
  private skillsDir: string;
  private generateFn: (input: SkillGenerateInput) => Promise<string>;

  constructor(
    skillsDir: string,
    generateFn: (input: SkillGenerateInput) => Promise<string>
  ) {
    this.skillsDir = skillsDir;
    this.generateFn = generateFn;
  }

  slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
  }

  async generate(input: SkillGenerateInput): Promise<{
    skillName: string;
    skillPath: string;
    content: string;
  }> {
    const slug = this.slugify(input.topic);
    const content = await this.generateFn(input);
    const skillDir = resolve(this.skillsDir, slug);
    mkdirSync(skillDir, { recursive: true });
    const skillPath = resolve(skillDir, "SKILL.md");
    writeFileSync(skillPath, content, "utf-8");

    return { skillName: slug, skillPath, content };
  }
}
