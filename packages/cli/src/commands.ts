export function printHelp(): void {
  console.log(`my-assistant — 基于 pi-agent 的个人 AI 管家

USAGE:
  my-assistant <command> [args]

COMMANDS:
  chat                      启动交互式聊天（默认）
  daemon start              启动后台守护进程
  daemon stop               停止守护进程
  daemon status             查看守护进程状态
  memory list               列出所有记忆
  memory search <关键词>     搜索记忆
  memory stats              记忆统计
  tasks list                列出定时任务
  tasks add                 添加定时任务
  tasks delete <id>         删除定时任务
  tasks log                 查看执行日志
  skills list               列出自动生成的 Skills
  skills delete <name>      删除 Skill
  config show               查看当前配置
  config edit               编辑配置文件
  config reset              重置初始化
  help                      显示帮助
`);
}

export async function routeCommand(
  args: string[]
): Promise<{ name: string; run: () => Promise<void> } | null> {
  if (args.length === 0 || args[0] === "chat") {
    return {
      name: "chat",
      run: async () => {
        const { startChatSession } = await import("./tui.js");
        await startChatSession();
      },
    };
  }

  const [cmd, sub] = args;

  if (cmd === "help") {
    printHelp();
    return { name: "help", run: async () => {} };
  }

  if (cmd === "config") {
    return {
      name: "config",
      run: async () => {
        const { ConfigManager, CONFIG_PATH } = await import("@my-assistant/core");
        const cm = new ConfigManager();
        if (sub === "show" || !sub) {
          console.log(JSON.stringify(cm.get(), null, 2));
          console.log(`\n配置文件: ${CONFIG_PATH}`);
        } else if (sub === "reset") {
          cm.reset();
          console.log("已重置。下次启动将重新进行初始化引导。");
        } else if (sub === "edit") {
          const { spawn } = await import("cross-spawn");
          const editor = process.env.EDITOR || "nano";
          spawn(editor, [CONFIG_PATH], { stdio: "inherit" });
        } else {
          console.log(`未知子命令: config ${sub}`);
        }
      },
    };
  }

  if (cmd === "memory") {
    return {
      name: "memory",
      run: async () => {
        const { ConfigManager } = await import("@my-assistant/core");
        const { MemoryEngine } = await import("@my-assistant/core/memory");
        const cm = new ConfigManager();
        cm.ensureDataDir();
        const engine = new MemoryEngine();
        if (sub === "list" || !sub) {
          const entries = engine.getAllEntries();
          if (entries.length === 0) {
            console.log("暂无记忆。");
          } else {
            entries.forEach((e) =>
              console.log(
                `[${e.type}] ${e.content}\n  keywords: ${e.keywords.join(", ")} | 访问: ${e.accessCount}次`
              )
            );
          }
        } else if (sub === "search") {
          const keyword = args.slice(2).join(" ");
          if (!keyword) {
            console.log("用法: my-assistant memory search <关键词>");
            return;
          }
          const results = engine.search(keyword);
          if (results.length === 0) {
            console.log(`未找到关于 "${keyword}" 的记忆。`);
          } else {
            results.forEach((r) => console.log(`[${r.type}] ${r.content}`));
          }
        } else if (sub === "stats") {
          const stats = engine.getStats();
          console.log(`活跃记忆: ${stats.entries} 条`);
          console.log(`压缩摘要: ${stats.summaries} 条`);
        } else {
          console.log(`未知子命令: memory ${sub}`);
        }
      },
    };
  }

  if (cmd === "tasks") {
    return {
      name: "tasks",
      run: async () => {
        const { existsSync, readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const { homedir } = await import("node:os");
        const tasksPath = resolve(homedir(), ".my-assistant", "data", "tasks.json");

        if (sub === "list" || !sub) {
          if (!existsSync(tasksPath)) {
            console.log("暂无定时任务。");
            return;
          }
          const store = JSON.parse(readFileSync(tasksPath, "utf-8"));
          if (!store.tasks || store.tasks.length === 0) {
            console.log("暂无定时任务。");
          } else {
            store.tasks.forEach((t: any) =>
              console.log(
                `[${t.enabled ? "启用" : "禁用"}] #${t.id}: ${t.description}\n  cron: ${t.cron} | 创建: ${t.createdAt}`
              )
            );
          }
        } else if (sub === "log") {
          const logsPath = resolve(homedir(), ".my-assistant", "data", "task-logs.json");
          if (!existsSync(logsPath)) {
            console.log("暂无执行日志。");
            return;
          }
          const logs = JSON.parse(readFileSync(logsPath, "utf-8"));
          logs.slice(-20).forEach((l: any) =>
            console.log(`[${l.timestamp}] ${l.taskId}: ${l.result}`)
          );
        } else {
          console.log(`未知子命令: tasks ${sub}`);
        }
      },
    };
  }

  if (cmd === "skills") {
    return {
      name: "skills",
      run: async () => {
        const { existsSync, readdirSync, readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const skillsDir = resolve(process.cwd(), ".pi", "skills");

        if (sub === "list" || !sub) {
          if (!existsSync(skillsDir)) {
            console.log("暂无自动生成的 Skills。（同类任务被提及 3 次后自动生成）");
            return;
          }
          const dirs = readdirSync(skillsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
          if (dirs.length === 0) {
            console.log("暂无 Skills。");
          } else {
            for (const d of dirs) {
              const skillPath = resolve(skillsDir, d, "SKILL.md");
              if (existsSync(skillPath)) {
                const content = readFileSync(skillPath, "utf-8");
                const nameMatch = content.match(/^name:\s*(.+)$/m);
                const descMatch = content.match(/^description:\s*(.+)$/m);
                console.log(`- ${d}${nameMatch ? ' (' + nameMatch[1] + ')' : ''}${descMatch ? ': ' + descMatch[1] : ''}`);
              }
            }
          }
        } else if (sub === "delete") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills delete <name>");
            return;
          }
          const { rmSync } = await import("node:fs");
          const skillDir = resolve(skillsDir, name);
          if (existsSync(skillDir)) {
            rmSync(skillDir, { recursive: true });
            console.log(`已删除 Skill: ${name}`);
          } else {
            console.log(`未找到 Skill: ${name}`);
          }
        } else {
          console.log(`未知子命令: skills ${sub}`);
        }
      },
    };
  }

  if (cmd === "daemon") {
    return {
      name: "daemon",
      run: async () => {
        const { spawn } = await import("cross-spawn");
        const { existsSync, readFileSync, unlinkSync } = await import("node:fs");
        const { resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const { homedir } = await import("node:os");

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        const DATA_DIR = resolve(homedir(), ".my-assistant", "data");
        const PID_PATH = resolve(DATA_DIR, "daemon.pid");
        // 2 levels up from packages/cli/dist/ reaches packages/, then into daemon/
        const DAEMON_SCRIPT = resolve(
          __dirname,
          "..",
          "..",
          "daemon",
          "dist",
          "index.js"
        );

        // Single function: get PID if daemon is running, null otherwise (avoids TOCTOU race)
        function getRunningPid(): number | null {
          if (!existsSync(PID_PATH)) return null;
          try {
            const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
            if (isNaN(pid)) return null;
            process.kill(pid, 0);
            return pid;
          } catch {
            return null;
          }
        }

        if (sub === "start") {
          const runningPid = getRunningPid();
          if (runningPid !== null) {
            console.log(`守护进程已在运行中 (pid: ${runningPid})。`);
            return;
          }

          if (!existsSync(DAEMON_SCRIPT)) {
            console.error(
              `守护进程脚本未找到: ${DAEMON_SCRIPT}\n` +
              `请先编译 daemon 包: cd packages/daemon && npx tsc`
            );
            return;
          }

          console.log("正在启动守护进程...");

          const child = spawn(
            process.execPath,
            [DAEMON_SCRIPT, "start"],
            {
              detached: true,
              stdio: "ignore",
            }
          );

          child.unref();

          // Wait briefly for PID file to be written
          await new Promise((r) => setTimeout(r, 1000));

          const startedPid = getRunningPid();
          if (startedPid !== null) {
            console.log(`守护进程已启动 (pid: ${startedPid})。`);
            console.log(`使用 "my-assistant daemon status" 查看状态。`);
            console.log(`使用 "my-assistant daemon stop" 停止守护进程。`);
          } else {
            console.log("守护进程启动失败。请检查日志。");
          }
        } else if (sub === "stop") {
          const pid = getRunningPid();
          if (pid === null) {
            console.log("守护进程未在运行。");
            return;
          }
          try {
            process.kill(pid, "SIGTERM");
            // Wait for PID file cleanup
            await new Promise((r) => setTimeout(r, 1000));
            if (getRunningPid() === null) {
              console.log(`守护进程已停止 (pid: ${pid})。`);
            } else {
              // Force kill
              process.kill(pid, "SIGKILL");
              await new Promise((r) => setTimeout(r, 500));
              try { unlinkSync(PID_PATH); } catch {}
              console.log(`守护进程已强制停止 (pid: ${pid})。`);
            }
          } catch (err) {
            console.error(`停止守护进程失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (sub === "status" || !sub) {
          const pid = getRunningPid();
          if (pid !== null) {
            console.log(`守护进程运行中 (pid: ${pid})。`);
          } else {
            console.log("守护进程未运行。");
            console.log(`使用 "my-assistant daemon start" 启动守护进程。`);
          }
        } else {
          console.log("用法: my-assistant daemon <start|stop|status>");
        }
      },
    };
  }

  return null;
}
