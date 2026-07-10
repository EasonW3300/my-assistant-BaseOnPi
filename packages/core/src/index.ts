import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { getModel, type Model } from "@earendil-works/pi-ai/compat";
import { resolve } from "node:path";
import { ConfigManager, CONFIG_DIR, DATA_DIR } from "./config.js";
import type { AssistantConfig } from "./config.js";
import { buildSystemPrompt } from "./soul.js";
import { createAllTools } from "./tools/index.js";
import { MemoryEngine } from "./memory/index.js";
import { TopicTracker } from "./skills/topic-tracker.js";
import { SkillGenerator } from "./skills/index.js";
import { SkillsEngine } from "./skills/engine.js";
import { createAllHooks } from "./hooks/index.js";
import type { MemoryExtractor } from "./hooks/memory-hooks.js";
import type { TopicExtractor } from "./hooks/skill-hooks.js";
import { createLLMMemoryExtractor } from "./extractors/memory-extractor.js";
import { createLLMTopicExtractor } from "./extractors/topic-extractor.js";
import { createSkillTools } from "./tools/skill-tools.js";

export type { AssistantConfig } from "./config.js";
export { ConfigManager, CONFIG_DIR, DATA_DIR, CONFIG_PATH, DEFAULT_CONFIG } from "./config.js";
export { buildSystemPrompt } from "./soul.js";
export { MemoryEngine } from "./memory/index.js";
export { TopicTracker } from "./skills/topic-tracker.js";
export { SkillGenerator } from "./skills/index.js";
export { SkillsEngine } from "./skills/engine.js";

export interface CreateAssistantOptions {
  mode?: "tui" | "headless";
  cwd?: string;
}

const DEFAULT_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

export async function createAssistantAgent(
  configManager: ConfigManager,
  options?: CreateAssistantOptions
) {
  const config = configManager.get();
  configManager.ensureDataDir();

  const cwd = options?.cwd ?? process.cwd();
  const skillsDir = resolve(cwd, ".pi", "skills");

  // ---- Auth & Model Registry ----
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    authStorage.setRuntimeApiKey("deepseek", apiKey);
  }

  // ---- Model Resolution ----
  let model: Model<any>;
  try {
    const provider = "deepseek";
    const modelId = config.model.default as any;
    const resolved =
      getModel(provider, modelId) ??
      getModel(provider, "deepseek-v4-pro" as any);
    if (!resolved) {
      throw new Error(
        `Model "${config.model.default}" not found in registry`
      );
    }
    model = resolved;
  } catch (err) {
    throw new Error(
      `Failed to resolve model "${config.model.default}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ---- Resolve cheap model for extractors ----
  let cheapModel: Model<any> | undefined;
  try {
    const cheapModelId = config.model.cheap as any;
    cheapModel =
      getModel("deepseek", cheapModelId) ??
      getModel("deepseek", "deepseek-v4-flash" as any);
    if (!cheapModel) {
      console.warn(
        `[my-assistant] Cheap model "${config.model.cheap}" not found, memory extraction disabled`
      );
    }
  } catch (err) {
    console.warn(
      `[my-assistant] Failed to resolve cheap model: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // ---- Engines ----
  const memoryEngine = new MemoryEngine();
  const topicTracker = new TopicTracker();
  const skillsEngine = new SkillsEngine(skillsDir);

  // ---- Custom Tools ----
  const customTools = [
    ...createAllTools(configManager, DATA_DIR),
    createSkillTools(skillsEngine),
  ];

  // ---- Skill Generator ----
  const skillGenerator = new SkillGenerator(
    skillsDir,
    async (input) => {
      return `---
name: ${input.topic.replace(/\s+/g, "-").toLowerCase().slice(0, 50)}
description: Auto-generated skill for "${input.topic}"
---

# ${input.topic}

## Trigger
When user asks about ${input.topic.toLowerCase()}.

## Steps
${input.history}

---
Generated: ${new Date().toISOString()}`;
    }
  );

  // ---- Extractors ----
  const memoryExtractor: MemoryExtractor = cheapModel
    ? createLLMMemoryExtractor(cheapModel)
    : {
        async extract(_text: string) {
          return [];
        },
      };

  const topicExtractor: TopicExtractor = cheapModel
    ? createLLMTopicExtractor(cheapModel)
    : {
        async extract(_text: string) {
          return { topic: "", category: "" };
        },
      };

  // ---- Hooks ----
  const hooks = createAllHooks(
    memoryEngine,
    topicTracker,
    skillGenerator,
    skillsEngine,
    memoryExtractor,
    topicExtractor,
    (topic, skillName, _content) => {
      console.log(
        `[my-assistant] Auto-generated skill "${skillName}" for topic "${topic}"`
      );
    }
  );

  // ---- System Prompt ----
  const systemPrompt = buildSystemPrompt(config);

  // ---- Resource Loader ----
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
  });
  await resourceLoader.reload();

  // ---- Session Manager ----
  const sessionManager =
    options?.mode === "headless"
      ? SessionManager.inMemory(cwd)
      : SessionManager.create(cwd, CONFIG_DIR);

  // ---- Tool Allowlist ----
  const allToolNames = [
    ...DEFAULT_TOOLS,
    ...customTools.map((t) => t.name),
  ];

  // ---- Create Agent Session ----
  const { session } = await createAgentSession({
    cwd,
    agentDir: CONFIG_DIR,
    model,
    thinkingLevel: "high",
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: allToolNames,
    customTools,
    sessionManager,
  });

  // ---- Wire Hooks to Session Events ----
  session.subscribe((event) => {
    if (event.type === "turn_end") {
      try {
        const messages = session.state.messages;
        hooks.memory.onTurnEnd(event as any, messages);
        hooks.skill.onTurnEnd(event as any, messages);
      } catch (err) {
        console.error("[my-assistant] Hook error:", err);
      }
    }
  });

  return {
    session,
    configManager,
    memoryEngine,
    skillsEngine,
    topicTracker,
    skillGenerator,
    dispose: () => session.dispose(),
  };
}
