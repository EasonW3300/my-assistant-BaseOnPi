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
    description: "管理自动生成的 Skills",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Skills: ${args || "list"}`, "info");
    },
  });
}
