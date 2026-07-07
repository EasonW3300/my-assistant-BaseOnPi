import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ConfigManager } from "../config.js";
import { createEmailTools } from "./email-tools.js";
import { createCronTools } from "./cron-tools.js";
import { createBashTool } from "./bash-tools.js";
import { createPlanTaskTool } from "./plan-tool.js";

export function createAllTools(
  configManager: ConfigManager,
  dataDir: string
): AgentTool[] {
  return [
    ...createEmailTools(configManager),
    ...createCronTools(dataDir),
    createBashTool(),
    createPlanTaskTool(),
  ];
}
