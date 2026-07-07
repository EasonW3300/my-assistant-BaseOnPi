import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

export function createPlanTaskTool(): AgentTool {
  return {
    name: "plan_task",
    label: "Plan Task",
    description:
      "Break down a complex task into numbered execution steps. Use before tackling multi-step tasks.",
    parameters: Type.Object({
      task: Type.String({ description: "The complex task to decompose" }),
    }),
    async execute(_toolCallId, params: any) {
      return {
        content: [
          {
            type: "text",
            text: `待规划任务: "${params.task}"\n\n请将此任务拆解为 3-8 个编号步骤。每步需指定: 步骤描述、使用的工具、预期输出。然后按顺序逐条执行，每完成一步汇报结果。`,
          },
        ],
        details: { task: params.task },
      };
    },
  };
}
