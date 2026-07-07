import type { TopicTracker } from "../skills/topic-tracker.js";
import type { SkillGenerator } from "../skills/index.js";
import type { AgentMessage, AgentEvent } from "@earendil-works/pi-agent-core";

export interface TopicExtractor {
  extract(text: string): Promise<{ topic: string; category: string }>;
}

export function createSkillHook(
  tracker: TopicTracker,
  generator: SkillGenerator,
  topicExtractor: TopicExtractor,
  onSkillGenerated: (
    topic: string,
    skillName: string,
    content: string
  ) => void
) {
  return {
    async onTurnEnd(
      _event: Extract<AgentEvent, { type: "turn_end" }>,
      messages: AgentMessage[]
    ) {
      const userText = messages
        .filter((m) => m.role === "user")
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

      if (!userText.trim()) return;

      try {
        const { topic, category } = await topicExtractor.extract(userText);
        if (!topic) return;

        const { count, shouldGenerate } = tracker.track(topic, category);

        if (shouldGenerate) {
          const { skillName, content } = await generator.generate({
            topic,
            category,
            history: `This topic "${topic}" has been mentioned ${count} times.`,
          });
          tracker.markGenerated(topic, skillName);
          onSkillGenerated(topic, skillName, content);
        }
      } catch (err) {
        console.error("[skill-hook] Detection failed:", err);
      }
    },
  };
}
