import cron from "node-cron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "@my-assistant/core/config";

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

const TASKS_PATH = resolve(DATA_DIR, "tasks.json");
const LOGS_PATH = resolve(DATA_DIR, "task-logs.json");

export class TaskScheduler {
  private jobs = new Map<string, cron.ScheduledTask>();
  private onExecute: (
    task: ScheduledTask
  ) => Promise<{ output: string; success: boolean }>;

  constructor(
    onExecute: (
      task: ScheduledTask
    ) => Promise<{ output: string; success: boolean }>
  ) {
    this.onExecute = onExecute;
  }

  start(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const store = this.loadTasks();
    for (const task of store.tasks) {
      if (task.enabled) this.scheduleTask(task);
    }
    console.log(`[scheduler] 已启动，${this.jobs.size} 个活跃任务`);
  }

  private scheduleTask(task: ScheduledTask): void {
    try {
      const job = cron.schedule(task.cron, async () => {
        console.log(`[scheduler] 执行任务: ${task.description}`);
        const result = await this.onExecute(task);
        this.logResult(
          task.id,
          result.success ? "success" : "error",
          result.output
        );
      });
      this.jobs.set(task.id, job);
    } catch (err) {
      console.error(
        `[scheduler] 无效 cron "${task.cron}" for task ${task.id}`
      );
    }
  }

  private loadTasks(): TaskStore {
    if (!existsSync(TASKS_PATH)) return { tasks: [] };
    try {
      return JSON.parse(readFileSync(TASKS_PATH, "utf-8")) as TaskStore;
    } catch {
      return { tasks: [] };
    }
  }

  private logResult(id: string, result: string, output: string): void {
    const logs = existsSync(LOGS_PATH)
      ? JSON.parse(readFileSync(LOGS_PATH, "utf-8"))
      : [];
    logs.push({
      taskId: id,
      result,
      output: output.slice(0, 500),
      timestamp: new Date().toISOString(),
    });
    writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), "utf-8");
  }

  stopAll(): void {
    for (const [, job] of this.jobs) job.stop();
    this.jobs.clear();
    console.log("[scheduler] 已停止");
  }
}
