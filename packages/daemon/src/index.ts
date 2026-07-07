import { ConfigManager, DATA_DIR } from "@my-assistant/core";
import { TaskScheduler } from "./scheduler.js";
import { MailWatcher } from "./mail-watcher.js";
import { runHeadlessAgent } from "./agent-runner.js";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";

const PID_PATH = resolve(DATA_DIR, "daemon.pid");

function checkRunning(): boolean {
  if (!existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0] ?? "status";

  if (sub === "start") {
    if (checkRunning()) {
      console.log("守护进程已在运行中。");
      process.exit(0);
    }

    const configManager = new ConfigManager();
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PID_PATH, String(process.pid), "utf-8");

    const scheduler = new TaskScheduler(async (task) => {
      return runHeadlessAgent(
        configManager,
        `执行定时任务: ${task.description}`
      );
    });

    const mailWatcher = new MailWatcher(configManager.get().email);

    console.log(`[daemon] 已启动 (pid: ${process.pid})`);
    scheduler.start();
    mailWatcher.start((mail) => {
      console.log(`[mail-watcher] 新邮件: ${mail.from} — ${mail.subject}`);
    });

    const shutdown = () => {
      console.log("\n[daemon] 正在关闭...");
      scheduler.stopAll();
      mailWatcher.stop();
      try { unlinkSync(PID_PATH); } catch {}
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } else if (sub === "stop") {
    if (!checkRunning()) {
      console.log("守护进程未在运行。");
      process.exit(0);
    }
    const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    console.log(`已发送停止信号 (pid: ${pid})`);
  } else if (sub === "status") {
    if (checkRunning()) {
      const pid = readFileSync(PID_PATH, "utf-8").trim();
      console.log(`守护进程运行中 (pid: ${pid})`);
    } else {
      console.log("守护进程未运行。");
    }
  } else {
    console.log("用法: my-assistant daemon <start|stop|status>");
  }
}

main().catch(console.error);
