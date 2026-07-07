import type { MemoryEngine } from "../memory/index.js";
import type { TopicTracker } from "../skills/topic-tracker.js";
import type { SkillGenerator } from "../skills/index.js";
import type { MemoryExtractor } from "./memory-hooks.js";
import { createMemoryHook } from "./memory-hooks.js";
import type { TopicExtractor } from "./skill-hooks.js";
import { createSkillHook } from "./skill-hooks.js";

export function createAllHooks(
  engine: MemoryEngine,
  tracker: TopicTracker,
  generator: SkillGenerator,
  memoryExtractor: MemoryExtractor,
  topicExtractor: TopicExtractor,
  onSkillGenerated: (
    topic: string,
    skillName: string,
    content: string
  ) => void
) {
  const memoryHook = createMemoryHook(engine, memoryExtractor);
  const skillHook = createSkillHook(
    tracker,
    generator,
    topicExtractor,
    onSkillGenerated
  );

  return {
    memory: { onTurnEnd: memoryHook.onTurnEnd },
    skill: { onTurnEnd: skillHook.onTurnEnd },
  };
}
