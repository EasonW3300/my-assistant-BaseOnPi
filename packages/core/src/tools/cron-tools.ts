import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface ScheduledTask {
  id: string;
  description: string;
  cron: string;
  createdAt: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
}

interface TaskStore {
  tasks: ScheduledTask[];
}

export function createCronTools(dataDir: string): AgentTool[] {
  const tasksPath = resolve(dataDir, "tasks.json");

  function readTasks(): TaskStore {
    if (!existsSync(tasksPath)) return { tasks: [] };
    try {
      return JSON.parse(readFileSync(tasksPath, "utf-8")) as TaskStore;
    } catch {
      return { tasks: [] };
    }
  }

  function writeTasks(store: TaskStore): void {
    mkdirSync(resolve(tasksPath, ".."), { recursive: true });
    writeFileSync(tasksPath, JSON.stringify(store, null, 2), "utf-8");
  }

  const scheduleTaskTool: AgentTool = {
    name: "schedule_task",
    label: "Schedule Task",
    description:
      "Create a scheduled task using cron expression. Example: '0 8 * * *' for daily at 8am.",
    parameters: Type.Object({
      description: Type.String({ description: "What the task does" }),
      cron: Type.String({
        description: "Cron expression (minute hour day month weekday)",
      }),
    }),
    async execute(_toolCallId, params: any) {
      const store = readTasks();
      const id = `task-${Date.now()}`;
      const task: ScheduledTask = {
        id,
        description: params.description,
        cron: params.cron,
        createdAt: new Date().toISOString(),
        enabled: true,
        lastRun: null,
        lastResult: null,
      };
      store.tasks.push(task);
      writeTasks(store);
      return {
        content: [
          {
            type: "text",
            text: `定时任务已创建: #${id} — "${params.description}"，cron: "${params.cron}"\n\n⚠️ 提醒：定时任务需要守护进程才能执行。请确保守护进程已启动：\n运行 "my-assistant daemon start" 启动守护进程。\n使用 "my-assistant daemon status" 检查守护进程状态。`,
          },
        ],
        details: task,
      };
    },
  };

  const listTasksTool: AgentTool = {
    name: "list_tasks",
    label: "List Scheduled Tasks",
    description: "List all scheduled tasks with their status.",
    parameters: Type.Object({}),
    async execute() {
      const store = readTasks();
      if (store.tasks.length === 0) {
        return {
          content: [{ type: "text", text: "暂无定时任务。" }],
          details: { tasks: [] },
        };
      }
      const lines = store.tasks.map(
        (t) =>
          `[${t.enabled ? "启用" : "禁用"}] #${t.id}: ${t.description} (cron: ${t.cron})${t.lastRun ? ` 上次: ${t.lastRun}` : ""}`
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { tasks: store.tasks },
      };
    },
  };

  const deleteTaskTool: AgentTool = {
    name: "delete_task",
    label: "Delete Scheduled Task",
    description: "Delete a scheduled task by ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Task ID to delete" }),
    }),
    async execute(_toolCallId, params: any) {
      const store = readTasks();
      const before = store.tasks.length;
      store.tasks = store.tasks.filter((t) => t.id !== params.id);
      writeTasks(store);
      return {
        content: [
          {
            type: "text",
            text:
              before > store.tasks.length
                ? `已删除任务 ${params.id}`
                : `未找到任务 ${params.id}`,
          },
        ],
        details: { deleted: before > store.tasks.length },
      };
    },
  };

  return [scheduleTaskTool, listTasksTool, deleteTaskTool];
}
