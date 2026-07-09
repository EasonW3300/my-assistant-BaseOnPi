import { ConfigManager } from "@my-assistant/core";
import { createAssistantAgent } from "@my-assistant/core";
import * as readline from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is 3 levels up from cli/src/tui.ts: cli/src -> cli -> packages -> project root
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

const BOOTSTRAP_MESSAGE = `你好！这是我们第一次见面。在开始之前，我想先认识你：
① 你希望怎么称呼我？（给我起个名字）
② 你希望我有什么性格特点？
   比如：幽默风趣、严谨专业、简洁高效、温柔体贴...`;

const BANNER = `
╔══════════════════════════════════╗
║         My-Assistant             ║
║       专属于你的个人AI管家          ║
║                         by: wys  ║
╚══════════════════════════════════╝
`;

export async function startChatSession() {
  const configManager = new ConfigManager();
  const isFirst = configManager.isFirstRun();

  console.log(BANNER);

  const { session, dispose } = await createAssistantAgent(configManager, {
    mode: "tui",
    cwd: process.cwd(),
    projectRoot: PROJECT_ROOT,
  });

  let hasTextOutput = false;

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      hasTextOutput = true;
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n  🔧 ${event.toolName}...`);
    }
    if (event.type === "tool_execution_end") {
      console.log(`  ✅ ${event.toolName} 完成`);
    }
    if (event.type === "agent_end") {
      if (!hasTextOutput) {
        console.log("\n(无文本输出 — 助手可能未能找到相关信息)");
      }
      console.log("\n" + "─".repeat(40));
      hasTextOutput = false;
    }
  });

  if (isFirst) {
    console.log(`\n小一 > ${BOOTSTRAP_MESSAGE}\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n你 > ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (input === "exit" || input === "quit" || input === "q") {
      console.log("再见！");
      rl.close();
      dispose();
      process.exit(0);
    }
    if (!input) {
      rl.prompt();
      return;
    }
    try {
      await session.prompt(input);
    } catch (err) {
      console.error(
        `错误: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    rl.prompt();
  });

  rl.on("close", () => {
    dispose();
    process.exit(0);
  });
}
