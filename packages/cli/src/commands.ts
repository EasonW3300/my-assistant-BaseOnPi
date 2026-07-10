export function printHelp(): void {
  console.log(`my-assistant — 专属于你的个人管家

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
  skills list               列出所有 Skills
  skills info <name>        查看 Skill 详情
  skills install <path>     从路径安装 Skill
  skills create <name>      交互式创建 Skill
  skills delete <name>      删除 Skill
  skills enable <name>      启用 Skill
  skills disable <name>     禁用 Skill
  skills search <query>     搜索 Skills
  skills stats              查看 Skills 统计
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
        const { resolve } = await import("node:path");
        const skillsDir = resolve(process.cwd(), ".pi", "skills");
        const { SkillsEngine } = await import("@my-assistant/core");
        const engine = new SkillsEngine(skillsDir);

        if (sub === "list" || !sub) {
          const skills = engine.list();
          if (skills.length === 0) {
            console.log("暂无 Skills。（将 SKILL.md 放入 .pi/skills/<name>/ 即可安装，或同类任务被提及 3 次后自动生成）");
            return;
          }
          console.log(`共 ${skills.length} 个 Skills:\n`);
          for (const s of skills) {
            const sourceLabel = s.source === "auto" ? "自动" : "手动";
            const statusLabel = s.enabled ? "✓" : "✗";
            console.log(`  [${statusLabel}] ${s.name} (${s.slug}) [${sourceLabel}]`);
            if (s.description) console.log(`      ${s.description}`);
          }
        } else if (sub === "info") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills info <name>");
            return;
          }
          const skill = engine.get(name);
          if (!skill) {
            console.log(`未找到 Skill: ${name}`);
            return;
          }
          console.log(`名称: ${skill.meta.name}`);
          console.log(`Slug: ${skill.meta.slug}`);
          console.log(`来源: ${skill.meta.source === "auto" ? "自动生成" : "手动安装"}`);
          console.log(`状态: ${skill.meta.enabled ? "启用" : "禁用"}`);
          console.log(`安装时间: ${skill.meta.installedAt}`);
          if (skill.meta.originPath) console.log(`原始路径: ${skill.meta.originPath}`);
          console.log(`\n--- SKILL.md ---\n`);
          console.log(skill.content);
        } else if (sub === "install") {
          const sourcePath = args[2];
          if (!sourcePath) {
            console.log("用法: my-assistant skills install <path>");
            console.log("  将包含 SKILL.md 的目录安装到 .pi/skills/ 中");
            return;
          }
          try {
            const meta = engine.install(sourcePath);
            console.log(`已安装 Skill: ${meta.name} (${meta.slug})`);
            console.log(`重启会话后生效。`);
          } catch (err) {
            console.log(`安装失败: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (sub === "create") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills create <name>");
            console.log("  交互式创建一个新的 SKILL.md");
            return;
          }

          // Interactive prompts
          const readline = await import("node:readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const question = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(q, resolve));

          console.log(`\n创建新 Skill: ${name}\n`);
          const skillName = await question(`名称 (显示名): `);
          const description = await question(`描述 (何时使用): `);
          const trigger = await question(`触发条件 (可选): `);
          const disableModel = await question(`禁用模型自动调用? (y/n, 默认 n): `);
          rl.close();

          // Generate SKILL.md content
          const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9一-鿿]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64);

          const frontmatter = [
            "---",
            `name: ${skillName || name}`,
            `description: ${description || "Use when relevant."}`,
          ];
          if (disableModel.toLowerCase() === "y") {
            frontmatter.push("disable-model-invocation: true");
          }
          frontmatter.push("---");

          const body = [
            `# ${skillName || name}`,
            "",
            "## Overview",
            description || "TODO: describe the core principle in 1-2 sentences.",
            "",
            "## When to Use",
            trigger || "TODO: describe when this skill applies.",
            "",
            "## Steps",
            "1. TODO: step one",
            "2. TODO: step two",
            "",
            "## Common Mistakes",
            "- TODO: what goes wrong",
          ];

          const content = [...frontmatter, "", ...body].join("\n");

          const { mkdirSync, writeFileSync } = await import("node:fs");
          const skillDir = resolve(skillsDir, slug);
          mkdirSync(skillDir, { recursive: true });
          writeFileSync(resolve(skillDir, "SKILL.md"), content, "utf-8");

          // Register in engine
          engine.reload();
          console.log(`\n已创建 Skill: ${slug}`);
          console.log(`文件: ${resolve(skillDir, "SKILL.md")}`);
          console.log(`重启会话后生效。`);
        } else if (sub === "delete") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills delete <name>");
            return;
          }
          const ok = engine.delete(name);
          console.log(ok ? `已删除 Skill: ${name}` : `未找到 Skill: ${name}`);
        } else if (sub === "enable") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills enable <name>");
            return;
          }
          const ok = engine.enable(name);
          console.log(ok ? `已启用 Skill: ${name}` : `未找到 Skill: ${name}（或已处于启用状态）`);
        } else if (sub === "disable") {
          const name = args[2];
          if (!name) {
            console.log("用法: my-assistant skills disable <name>");
            return;
          }
          const ok = engine.disable(name);
          console.log(ok ? `已禁用 Skill: ${name}` : `未找到 Skill: ${name}（或已处于禁用状态）`);
        } else if (sub === "search") {
          const query = args.slice(2).join(" ");
          if (!query) {
            console.log("用法: my-assistant skills search <query>");
            return;
          }
          const results = engine.search(query);
          if (results.length === 0) {
            console.log(`未找到与 "${query}" 相关的 Skill。`);
          } else {
            console.log(`找到 ${results.length} 个结果:\n`);
            for (const r of results) {
              console.log(`  - ${r.meta.name} (${r.meta.slug}) [${r.meta.enabled ? "启用" : "禁用"}]`);
              console.log(`    ${r.snippet}`);
            }
          }
        } else if (sub === "stats") {
          const stats = engine.getStats();
          console.log(`Skills 统计:`);
          console.log(`  总数: ${stats.total}`);
          console.log(`  启用: ${stats.enabled}`);
          console.log(`  禁用: ${stats.total - stats.enabled}`);
          console.log(`  自动生成: ${stats.auto}`);
          console.log(`  手动安装: ${stats.manual}`);
        } else {
          console.log(`未知子命令: skills ${sub}`);
          console.log(`可用: list, info, install, create, delete, enable, disable, search, stats`);
        }
      },
    };
  }

  if (cmd === "daemon") {
    return {
      name: "daemon",
      run: async () => {
        console.log(
          `daemon ${sub ?? "status"}: 守护进程管理由 @my-assistant/daemon 包提供。`
        );
      },
    };
  }

  return null;
}
