import type { Model } from "@earendil-works/pi-ai/compat";
import { complete } from "@earendil-works/pi-ai/compat";
import type { MemoryExtractor } from "../hooks/memory-hooks.js";

const SYSTEM_PROMPT = `你是一个记忆提取助手。分析以下对话内容，从中提取需要记住的重要信息。

提取类型：
- preference（偏好）：用户的喜好、习惯、常用工具/语言/框架等
- fact（事实）：用户的基本信息、经历、社交关系、项目背景等
- task（任务）：用户交代的待办事项、承诺、计划要做的事

以 JSON 数组格式输出，每个元素包含：
- type: "preference" | "fact" | "task"
- content: 一句话概括（中文）
- keywords: 关键词数组（2-5个中文或英文关键词）

如果对话中没有值得记住的新信息，输出空数组 []。

只输出 JSON 数组，不要输出任何其他文字、解释或 markdown 标记。`;

interface RawExtractedItem {
  type?: string;
  content?: string;
  keywords?: string[];
}

/**
 * Extract text content from an AssistantMessage's content blocks.
 * Handles both text blocks and thinking blocks (which we skip).
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
function parseExtractionResult(text: string): RawExtractedItem[] {
  const trimmed = text.trim();

  // Try direct parse first
  try {
    const result = JSON.parse(trimmed);
    if (Array.isArray(result)) return result;
  } catch {
    // Continue to fallback strategies
  }

  // Try extracting from markdown code fence: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const result = JSON.parse(fenceMatch[1].trim());
      if (Array.isArray(result)) return result;
    } catch {
      // Continue
    }
  }

  // Try extracting from first [ to last ]
  const bracketMatch = trimmed.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try {
      const result = JSON.parse(bracketMatch[0]);
      if (Array.isArray(result)) return result;
    } catch {
      // Continue
    }
  }

  return [];
}

/**
 * Validate and filter extracted items against the MemoryExtractor schema.
 */
function validateExtractedItems(
  items: RawExtractedItem[]
): Array<{ type: "preference" | "fact" | "task"; content: string; keywords: string[] }> {
  const validTypes = new Set(["preference", "fact", "task"]);

  return items.filter((item): item is {
    type: "preference" | "fact" | "task";
    content: string;
    keywords: string[];
  } => {
    if (!item.type || !validTypes.has(item.type)) {
      console.warn(
        "[memory-extractor] Skipping item with invalid type:",
        JSON.stringify(item).slice(0, 200)
      );
      return false;
    }
    if (!item.content || typeof item.content !== "string") {
      console.warn(
        "[memory-extractor] Skipping item without valid content:",
        JSON.stringify(item).slice(0, 200)
      );
      return false;
    }
    if (!Array.isArray(item.keywords)) {
      console.warn(
        "[memory-extractor] Skipping item without keywords array:",
        JSON.stringify(item).slice(0, 200)
      );
      return false;
    }
    return true;
  });
}

/**
 * Create an LLM-driven memory extractor using the given model.
 *
 * @param model - A resolved Model object (typically the cheap model).
 * @returns A MemoryExtractor that analyzes conversation text and returns structured memories.
 */
export function createLLMMemoryExtractor(model: Model<any>): MemoryExtractor {
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
          // Let withEnvApiKey auto-detect DEEPSEEK_API_KEY from env
          maxTokens: 2048,
        }
      );

      const responseText = extractTextFromResponse(response.content);

      if (!responseText.trim()) {
        console.warn(
          "[memory-extractor] LLM returned empty response, no memories extracted"
        );
        return [];
      }

      const rawItems = parseExtractionResult(responseText);

      if (rawItems.length === 0) {
        // Valid case: no new information to remember
        return [];
      }

      const validated = validateExtractedItems(rawItems);

      if (validated.length > 0) {
        console.log(
          `[memory-extractor] Extracted ${validated.length} memories:`,
          validated.map((m) => `[${m.type}] ${m.content.slice(0, 60)}`)
        );
      }

      return validated;
    },
  };
}
