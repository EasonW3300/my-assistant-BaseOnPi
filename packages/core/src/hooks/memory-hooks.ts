import type { MemoryEngine } from "../memory/index.js";
import type { AgentMessage, AgentEvent } from "@earendil-works/pi-agent-core";

export interface MemoryExtractor {
  extract(
    text: string
  ): Promise<
    Array<{
      type: "preference" | "fact" | "task";
      content: string;
      keywords: string[];
    }>
  >;
}

export function createMemoryHook(
  engine: MemoryEngine,
  extractor: MemoryExtractor
) {
  return {
    async onTurnEnd(
      _event: Extract<AgentEvent, { type: "turn_end" }>,
      messages: AgentMessage[]
    ) {
      const conversationText = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          if (typeof m.content === "string") return m.content;
          if (Array.isArray(m.content)) {
            return m.content
              .filter(
                (c): c is { type: "text"; text: string } =>
                  c.type === "text"
              )
              .map((c) => c.text)
              .join("\n");
          }
          return "";
        })
        .join("\n");

      if (!conversationText.trim()) return;

      try {
        const extracted = await extractor.extract(conversationText);

        for (const item of extracted) {
          // Dedup: search with each keyword, merge results
          let bestMatch: (ReturnType<typeof engine.search>)[0] | undefined;
          for (const kw of item.keywords) {
            const found = engine.search(kw);
            if (found.length > 0) {
              bestMatch = found[0];
              break;
            }
          }
          if (bestMatch && bestMatch.source !== "summary") {
            // Merge: update content and keywords
            engine.update(bestMatch.id, {
              content: item.content,
              keywords: [
                ...new Set([...bestMatch.keywords, ...item.keywords]),
              ],
            });
            continue;
          }
          // New memory
          engine.add({ ...item, source: "conversation" });
        }
      } catch (err) {
        console.error("[memory-hook] Extraction failed:", err);
      }
    },
  };
}
