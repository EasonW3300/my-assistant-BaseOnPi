import { ConfigManager } from "@my-assistant/core";
import { createAssistantAgent } from "@my-assistant/core";
import * as readline from "node:readline";

const BOOTSTRAP_MESSAGE = `你好！这是我们第一次见面。在开始之前，我想先认识你：
① 你希望怎么称呼我？（给我起个名字）
② 你希望我有什么性格特点？
   比如：幽默风趣、严谨专业、简洁高效、温柔体贴...`;

const BANNER = `
╔══════════════════════════════════╗
║         My-Assistant            ║
║   基于 pi-agent 的个人 AI 管家    ║
╚══════════════════════════════════╝
`;

export async function startChatSession() {
  const configManager = new ConfigManager();
  const isFirst = configManager.isFirstRun();

  console.log(BANNER);

  const { session, dispose } = await createAssistantAgent(configManager, {
    mode: "tui",
    cwd: process.cwd(),
  });

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n  🔧 ${event.toolName}...`);
    }
    if (event.type === "agent_end") {
      console.log("\n" + "─".repeat(40));
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
