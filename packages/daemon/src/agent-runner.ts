import { ConfigManager } from "@my-assistant/core";
import { createAssistantAgent } from "@my-assistant/core";

export async function runHeadlessAgent(
  configManager: ConfigManager,
  prompt: string
): Promise<{ output: string; success: boolean }> {
  const { session, dispose } = await createAssistantAgent(configManager, {
    mode: "headless",
  });

  let output = "";

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      output += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(prompt);
    return { output, success: true };
  } catch (err) {
    return {
      output: err instanceof Error ? err.message : String(err),
      success: false,
    };
  } finally {
    dispose();
  }
}
