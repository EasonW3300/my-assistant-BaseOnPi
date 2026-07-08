import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { ConfigManager } from "../config.js";

export function createConfigTools(configManager: ConfigManager): AgentTool[] {
  const updateAssistantTool: AgentTool = {
    name: "update_assistant_config",
    label: "Update Assistant Config",
    description:
      "Update the assistant's name and personality. Use this during first-run setup when the user tells you their preferred name and personality for the assistant. After calling this, the assistant will be considered 'customized' and the bootstrap flow will not repeat on next session.",
    parameters: Type.Object({
      name: Type.String({ description: "The name the user wants to call the assistant" }),
      personality: Type.String({
        description: "The personality traits the user wants the assistant to have, e.g. '幽默风趣、严谨专业、简洁高效'",
      }),
    }),
    async execute(_toolCallId, params: any) {
      const name = String(params.name ?? "").trim();
      const personality = String(params.personality ?? "").trim();

      if (!name || !personality) {
        return {
          content: [
            {
              type: "text",
              text: "名称和性格描述都不能为空。请让用户提供完整的名称和性格描述。",
            },
          ],
          details: { success: false },
        };
      }

      configManager.updateAssistant(name, personality);

      return {
        content: [
          {
            type: "text",
            text: `已更新助手配置：名称="${name}"，性格="${personality}"。下次启动将不再显示初始化引导。`,
          },
        ],
        details: { name, personality, customized: true },
      };
    },
  };

  const getAssistantConfigTool: AgentTool = {
    name: "get_assistant_config",
    label: "Get Assistant Config",
    description:
      "Get the current assistant configuration including name, personality, and whether it has been customized.",
    parameters: Type.Object({}),
    async execute() {
      const config = configManager.get();
      return {
        content: [
          {
            type: "text",
            text: `当前助手配置：\n名称：${config.assistant.name}\n性格：${config.assistant.personality}\n已自定义：${config.assistant.customized ? "是" : "否"}`,
          },
        ],
        details: config.assistant,
      };
    },
  };

  return [updateAssistantTool, getAssistantConfigTool];
}
