export type { AssistantConfig } from "./config.js";
export { ConfigManager, CONFIG_DIR, DATA_DIR, CONFIG_PATH, DEFAULT_CONFIG } from "./config.js";

export interface CreateAssistantOptions {
  mode?: "tui" | "headless";
  cwd?: string;
}

export async function createAssistantAgent(
  _configManager: any,
  _options?: CreateAssistantOptions
): Promise<any> {
  throw new Error("Not implemented yet — core modules pending");
}
