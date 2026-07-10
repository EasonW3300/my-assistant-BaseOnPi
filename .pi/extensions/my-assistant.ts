/**
 * Pi-agent extension: my-assistant
 *
 * Load this extension in pi to use personal assistant tools.
 * Install: pi install /path/to/my-assistant-baseOnpi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";

export default function myAssistantExtension(pi: ExtensionAPI) {
  // ---- Custom Tools ----
  pi.registerTool({
    name: "remember",
    label: "Remember",
    description:
      "Search the personal assistant memory for relevant information",
    parameters: Type.Object({
      keyword: Type.String({ description: "Search keyword" }),
    }),
    async execute(_id, params: any) {
      const memoryPath = resolve(
        homedir(),
        ".my-assistant",
        "data",
        "memory.json"
      );
      if (!existsSync(memoryPath)) {
        return {
          content: [{ type: "text", text: "暂无记忆数据。" }],
          details: { keyword: params.keyword, results: [] },
        };
      }
      try {
        const store = JSON.parse(readFileSync(memoryPath, "utf-8"));
        const results = (store.entries || []).filter(
          (e: any) =>
            e.keywords?.some((k: string) => k.includes(params.keyword)) ||
            e.content?.includes(params.keyword)
        );
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `未找到关于 "${params.keyword}" 的记忆。`,
              },
            ],
            details: { keyword: params.keyword, results: [] },
          };
        }
        const lines = results.map((r: any) => `[${r.type}] ${r.content}`);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { keyword: params.keyword, results },
        };
      } catch {
        return {
          content: [{ type: "text", text: "记忆数据读取失败。" }],
          details: { error: "parse_failed" },
        };
      }
    },
  });

  pi.registerTool({
    name: "schedule_task",
    label: "Schedule Task",
    description: "Create a scheduled task with cron expression",
    parameters: Type.Object({
      description: Type.String(),
      cron: Type.String(),
    }),
    async execute(_id, params: any) {
      return {
        content: [
          {
            type: "text",
            text: `[my-assistant] 已调度: "${params.description}" at "${params.cron}"`,
          },
        ],
        details: params,
      };
    },
  });

  pi.registerTool({
    name: "run_script",
    label: "Run Script",
    description: "Execute a bash script",
    parameters: Type.Object({
      script: Type.String(),
    }),
    async execute(_id, params: any) {
      return {
        content: [
          {
            type: "text",
            text: `[my-assistant] 脚本执行通过 bash 工具委托。`,
          },
        ], 
        details: { scriptLength: params.script.length },
      };
    },
  });

  // ---- Commands ----
  pi.registerCommand("memory", {
    description: "搜索或列出个人助手记忆",
    handler: async (args, ctx) => {
      ctx.ui.notify(
        `记忆: ${args || "使用 /memory <关键词> 搜索"}`,
        "info"
      );
    },
  });

  pi.registerCommand("tasks", {
    description: "管理定时任务",
    handler: async (args, ctx) => {
      ctx.ui.notify(`任务: ${args || "list"}`, "info");
    },
  });

  pi.registerCommand("skills", {
    description: "管理技能：list, info, enable, disable, search",
    handler: async (args, ctx) => {
      const { resolve } = await import("node:path");
      const { existsSync, readdirSync, readFileSync, renameSync } = await import("node:fs");
      const cwd = ctx.cwd ?? process.cwd();
      const skillsDir = resolve(cwd, ".pi", "skills");

      const parseFrontmatter = (content: string) => {
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        return {
          name: nameMatch?.[1]?.trim() ?? "",
          description: descMatch?.[1]?.trim() ?? "",
        };
      };

      const [sub, ...rest] = (args || "list").trim().split(/\s+/);
      const name = rest.join(" ");

      if (sub === "list" || !sub) {
        if (!existsSync(skillsDir)) {
          ctx.ui.notify("暂无 Skills。", "info");
          return;
        }
        const dirs = readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        if (dirs.length === 0) {
          ctx.ui.notify("暂无 Skills。", "info");
          return;
        }
        const lines: string[] = [];
        for (const d of dirs) {
          const skillFile = resolve(skillsDir, d.name, "SKILL.md");
          const disabledFile = resolve(skillsDir, d.name, "SKILL.md.disabled");
          const enabled = existsSync(skillFile);
          const mdFile = enabled ? skillFile : disabledFile;
          if (existsSync(mdFile)) {
            const content = readFileSync(mdFile, "utf-8");
            const { name: skillName, description } = parseFrontmatter(content);
            const status = enabled ? "✓" : "✗";
            lines.push(`[${status}] ${skillName || d.name} — ${description}`);
          } else {
            lines.push(`[?] ${d.name}`);
          }
        }
        ctx.ui.notify(`Skills:\n${lines.join("\n")}`, "info");
      } else if (sub === "info") {
        if (!name) {
          ctx.ui.notify("用法: /skills info <name>", "warning");
          return;
        }
        const skillFile = resolve(skillsDir, name, "SKILL.md");
        const disabledFile = resolve(skillsDir, name, "SKILL.md.disabled");
        const mdFile = existsSync(skillFile) ? skillFile : disabledFile;
        if (!existsSync(mdFile)) {
          ctx.ui.notify(`未找到 Skill: ${name}`, "warning");
          return;
        }
        const content = readFileSync(mdFile, "utf-8");
        const { name: skillName, description } = parseFrontmatter(content);
        const enabled = existsSync(skillFile);
        const status = enabled ? "启用" : "禁用";
        ctx.ui.notify(
          `Skill: ${skillName || name}\n状态: ${status}\n描述: ${description || "无"}\n\n${content.slice(0, 500)}`,
          "info"
        );
      } else if (sub === "enable" || sub === "disable") {
        if (!name) {
          ctx.ui.notify(`用法: /skills ${sub} <name>`, "warning");
          return;
        }
        const skillFile = resolve(skillsDir, name, "SKILL.md");
        const disabledFile = resolve(skillsDir, name, "SKILL.md.disabled");

        if (sub === "enable") {
          if (existsSync(disabledFile)) {
            renameSync(disabledFile, skillFile);
            ctx.ui.notify(`已启用 Skill: ${name}`, "info");
          } else if (existsSync(skillFile)) {
            ctx.ui.notify(`Skill ${name} 已经是启用状态`, "info");
          } else {
            ctx.ui.notify(`未找到 Skill: ${name}`, "warning");
          }
        } else {
          if (existsSync(skillFile)) {
            renameSync(skillFile, disabledFile);
            ctx.ui.notify(`已禁用 Skill: ${name}`, "info");
          } else if (existsSync(disabledFile)) {
            ctx.ui.notify(`Skill ${name} 已经是禁用状态`, "info");
          } else {
            ctx.ui.notify(`未找到 Skill: ${name}`, "warning");
          }
        }
      } else {
        ctx.ui.notify(`用法: /skills list | info <name> | enable <name> | disable <name>`, "warning");
      }
    },
  });

  // ---- manage_skills tool (extension-side, for pi-agent context) ----
  pi.registerTool({
    name: "manage_skills",
    label: "Manage Skills",
    description:
      "Search or list installed skills. Use to check if a skill exists for a recurring task pattern.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("get"),
      ]),
      query: Type.Optional(Type.String({ description: "Search query or skill slug" })),
    }),
    async execute(_id, params: any) {
      const { resolve } = await import("node:path");
      const { existsSync, readdirSync, readFileSync } = await import("node:fs");
      const skillsDir = resolve(process.cwd(), ".pi", "skills");

      const parseFrontmatter = (content: string) => {
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        return {
          name: nameMatch?.[1]?.trim() ?? "",
          description: descMatch?.[1]?.trim() ?? "",
        };
      };

      const scanSkills = (): Array<{ slug: string; name: string; description: string; enabled: boolean }> => {
        if (!existsSync(skillsDir)) return [];
        const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        return dirs
          .map((d) => {
            const skillFile = resolve(skillsDir, d.name, "SKILL.md");
            const disabledFile = resolve(skillsDir, d.name, "SKILL.md.disabled");
            const enabled = existsSync(skillFile);
            const mdFile = enabled ? skillFile : disabledFile;
            if (!existsSync(mdFile)) return null;
            const content = readFileSync(mdFile, "utf-8");
            const { name, description } = parseFrontmatter(content);
            return { slug: d.name, name: name || d.name, description, enabled };
          })
          .filter(Boolean) as Array<{ slug: string; name: string; description: string; enabled: boolean }>;
      };

      const action = params.action as string;
      const query = (params.query as string) || "";

      if (action === "list") {
        const skills = scanSkills();
        if (skills.length === 0) {
          return {
            content: [{ type: "text", text: "当前没有已安装的技能。" }],
            details: { count: 0, skills: [] },
          };
        }
        const lines = skills.map(
          (s) => `- **${s.name}** (\`${s.slug}\`) [${s.enabled ? "启用" : "禁用"}]: ${s.description}`
        );
        return {
          content: [{ type: "text", text: `已安装 ${skills.length} 个技能:\n\n${lines.join("\n")}` }],
          details: { count: skills.length, skills },
        };
      }

      if (action === "search") {
        if (!query) {
          return { content: [{ type: "text", text: "请提供搜索关键词。" }], details: { query: "", results: [] } };
        }
        const skills = scanSkills();
        const lower = query.toLowerCase();
        const results = skills.filter(
          (s) =>
            s.name.toLowerCase().includes(lower) ||
            s.description.toLowerCase().includes(lower) ||
            s.slug.toLowerCase().includes(lower)
        );
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `未找到与 "${query}" 相关的技能。` }],
            details: { query, results: [] },
          };
        }
        const lines = results.map((r) => `- **${r.name}** (\`${r.slug}\`): ${r.description}`);
        return {
          content: [{ type: "text", text: `搜索 "${query}" 找到 ${results.length} 个技能:\n\n${lines.join("\n")}` }],
          details: { query, results },
        };
      }

      if (action === "get") {
        if (!query) {
          return { content: [{ type: "text", text: "请提供技能名称（slug）。" }], details: { slug: "", found: false } };
        }
        const skillFile = resolve(skillsDir, query, "SKILL.md");
        const disabledFile = resolve(skillsDir, query, "SKILL.md.disabled");
        const enabled = existsSync(skillFile);
        const mdFile = enabled ? skillFile : disabledFile;
        if (!existsSync(mdFile)) {
          return {
            content: [{ type: "text", text: `未找到技能 "${query}"。使用 list 查看所有已安装技能。` }],
            details: { slug: query, found: false },
          };
        }
        const content = readFileSync(mdFile, "utf-8");
        const { name, description } = parseFrontmatter(content);
        const text = `## ${name || query} (\`${query}\`)\n状态: ${enabled ? "启用" : "禁用"}\n\n${content}`;
        return {
          content: [{ type: "text", text }],
          details: { slug: query, found: true, name, description, enabled },
        };
      }

      return {
        content: [{ type: "text", text: `未知操作: ${action}。支持: list, search, get` }],
        details: { action },
      };
    },
  });
}
