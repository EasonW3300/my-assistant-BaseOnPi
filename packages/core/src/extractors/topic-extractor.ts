import type { Model } from "@earendil-works/pi-ai/compat";
import { complete } from "@earendil-works/pi-ai/compat";
import type { TopicExtractor } from "../hooks/skill-hooks.js";

const SYSTEM_PROMPT = `你是一个话题检测助手。分析用户的消息，识别其中反复出现的任务模式或话题。

如果用户正在执行某个可以模板化的重复任务（如：特定格式的数据处理、项目初始化步骤、代码审查流程、部署流程等），请提取：
- topic: 任务/话题的简短名称（中文，10字以内）
- category: 分类，可选值：coding（编码）/ writing（写作）/ data（数据处理）/ communication（沟通）/ other（其他）

如果用户的消息只是普通对话、闲聊或单次请求，没有明显的可模板化任务模式，返回：
{ "topic": "", "category": "" }

只输出 JSON 对象，不要输出任何其他文字、解释或 markdown 标记。`;

interface RawExtractedTopic {
  topic?: string;
  category?: string;
}

/**
 * Extract text content from message content blocks.
 */
function extractTextFromResponse(
  content: Array<{ type: string; text?: string }>
): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/**
 * Robust JSON extraction from LLM output.
 * Handles: raw JSON, markdown code fences, and text with JSON embedded.
 */
function parseExtractionResult(text: string): RawExtractedTopic {
  const trimmed = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed) as RawExtractedTopic;
  } catch {
    // Continue to fallback strategies
  }

  // Try extracting from markdown code fence: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as RawExtractedTopic;
    } catch {
      // Continue
    }
  }

  // Try extracting from first { to last }
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as RawExtractedTopic;
    } catch {
      // Continue
    }
  }

  return { topic: "", category: "" };
}

/**
 * Validate extracted topic result.
 */
function validateTopic(result: RawExtractedTopic): {
  topic: string;
  category: string;
} {
  const topic = typeof result.topic === "string" ? result.topic.trim() : "";
  const category = typeof result.category === "string" ? result.category.trim() : "";

  // Valid categories
  const validCategories = new Set([
    "coding",
    "writing",
    "data",
    "communication",
    "other",
  ]);

  return {
    topic: topic.slice(0, 50), // Max 50 chars for topic name
    category: validCategories.has(category) ? category : "other",
  };
}

/**
 * Create an LLM-driven topic extractor using the given model.
 *
 * @param model - A resolved Model object (typically the cheap model).
 * @returns A TopicExtractor that analyzes conversation text and extracts task topics.
 */
export function createLLMTopicExtractor(model: Model<any>): TopicExtractor {
  return {
    async extract(text: string) {
      const response = await complete(
        model,
        {
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: text,
              timestamp: Date.now(),
            },
          ],
        },
        {
          maxTokens: 512,
        }
      );

      const responseText = extractTextFromResponse(response.content);

      if (!responseText.trim()) {
        console.warn(
          "[topic-extractor] LLM returned empty response, no topic extracted"
        );
        return { topic: "", category: "" };
      }

      const raw = parseExtractionResult(responseText);
      const validated = validateTopic(raw);

      if (validated.topic) {
        console.log(
          `[topic-extractor] Extracted topic: "${validated.topic}" (${validated.category})`
        );
      }

      return validated;
    },
  };
}
