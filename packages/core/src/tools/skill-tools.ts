import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { SkillsEngine } from "../skills/engine.js";

export function createSkillTools(engine: SkillsEngine): AgentTool {
  return {
    name: "manage_skills",
    label: "Manage Skills",
    description:
      "Search or list learned skills. Use when you need to check if a skill exists for a recurring task pattern, or to look up best practices for a specific topic.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("get"),
      ]),
      query: Type.Optional(
        Type.String({ description: "Search query or skill slug to retrieve" })
      ),
    }),
    async execute(_toolCallId, params: any) {
      const action = params.action as "list" | "search" | "get";
      const query = (params.query as string) || "";

      switch (action) {
        case "list": {
          const skills = engine.list();
          if (skills.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "当前没有已安装的技能。当你在对话中重复执行同类任务 3 次后，系统会自动生成技能。你也可以手动安装技能。",
                },
              ],
              details: { count: 0, skills: [] },
            };
          }
          const lines = skills.map(
            (s) =>
              `- **${s.name}** (\`${s.slug}\`) [${s.source === "auto" ? "自动生成" : "手动安装"}] [${s.enabled ? "启用" : "禁用"}]: ${s.description}`
          );
          return {
            content: [
              {
                type: "text",
                text: `已安装 ${skills.length} 个技能:\n\n${lines.join("\n")}`,
              },
            ],
            details: { count: skills.length, skills },
          };
        }

        case "search": {
          if (!query) {
            return {
              content: [
                { type: "text", text: "请提供搜索关键词。" },
              ],
              details: { query: "", results: [] },
            };
          }
          const results = engine.search(query);
          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `未找到与 "${query}" 相关的技能。`,
                },
              ],
              details: { query, results: [] },
            };
          }
          const lines = results.map(
            (r) =>
              `- **${r.meta.name}** (\`${r.meta.slug}\`): ${r.snippet}`
          );
          return {
            content: [
              {
                type: "text",
                text: `搜索 "${query}" 找到 ${results.length} 个技能:\n\n${lines.join("\n")}`,
              },
            ],
            details: { query, results },
          };
        }

        case "get": {
          if (!query) {
            return {
              content: [
                { type: "text", text: "请提供技能名称（slug）。" },
              ],
              details: { slug: "", found: false },
            };
          }
          const skill = engine.get(query);
          if (!skill) {
            return {
              content: [
                {
                  type: "text",
                  text: `未找到技能 "${query}"。使用 list 查看所有已安装技能。`,
                },
              ],
              details: { slug: query, found: false },
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `## ${skill.meta.name} (\`${skill.meta.slug}\`)\n来源: ${skill.meta.source === "auto" ? "自动生成" : "手动安装"} | 状态: ${skill.meta.enabled ? "启用" : "禁用"}\n\n${skill.content}`,
              },
            ],
            details: { slug: query, found: true, meta: skill.meta },
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `未知操作: ${action}。支持的操作: list, search, get`,
              },
            ],
            details: { action },
          };
      }
    },
  };
}
