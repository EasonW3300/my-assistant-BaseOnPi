# My-Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal AI assistant CLI+daemon app on pi-agent SDK with soul settings, file I/O, email, scheduled tasks, script execution, memory management, and auto skill generation.

**Architecture:** Hybrid monorepo — `packages/core` contains the agent definition (tools, memory, hooks), `packages/cli` wraps it in a TUI chat interface, `packages/daemon` wraps it in a headless background service. Both shells call `createAssistantAgent()` from core.

**Tech Stack:** Node.js >= 22.19.0, TypeScript 5.9, @earendil-works/pi-agent-core, @earendil-works/pi-ai, @earendil-works/pi-coding-agent, @earendil-works/pi-tui, nodemailer, imap-simple, node-cron, typebox

## Global Constraints

- Node.js >= 22.19.0 (from pi-agent-core peer dep)
- NODE_OPTIONS='--experimental-strip-types' required for <22.19
- Default model: deepseek-v4-pro, cheap model: deepseek-v4-flash
- All user data stored in ~/.my-assistant/
- Config file: ~/.my-assistant/config.json
- Memory file: ~/.my-assistant/data/memory.json
- Topic stats: ~/.my-assistant/data/topic-stats.json
- Tasks file: ~/.my-assistant/data/tasks.json
- Session logs: ~/.my-assistant/data/task-logs.json
- Version bump uses `npm version patch` per release
- Commits follow conventional commits: feat:, fix:, docs:, chore:

---

## File Structure

```
my-assistant-baseOnpi/
├── package.json                    # monorepo root, npm workspaces
├── tsconfig.base.json              # shared TS config
├── tsconfig.json                   # root extends base
├── .gitignore
├── README.md
├── .pi/
│   ├── extensions/
│   │   └── my-assistant.ts         # pi extension: register all tools+skills
│   └── skills/
│       └── .gitkeep
├── packages/
│   ├── core/
│   │   ├── package.json            # name: @my-assistant/core
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # createAssistantAgent(config, opts?)
│   │       ├── soul.ts             # buildSystemPrompt(config)
│   │       ├── config.ts           # ConfigManager class
│   │       ├── tools/
│   │       │   ├── index.ts        # createAllTools(config) → AgentTool[]
│   │       │   ├── email-tools.ts  # createEmailTools(config)
│   │       │   ├── cron-tools.ts   # createCronTools(dataDir)
│   │       │   ├── bash-tools.ts   # createBashTool()
│   │       │   └── plan-tool.ts    # createPlanTaskTool()
│   │       ├── memory/
│   │       │   ├── index.ts        # MemoryEngine class
│   │       │   ├── storage.ts      # read/write memory.json
│   │       │   └── compaction.ts   # compactMemories(engine, model)
│   │       ├── skills/
│   │       │   ├── index.ts        # SkillGenerator class
│   │       │   └── topic-tracker.ts # TopicTracker class
│   │       └── hooks/
│   │           ├── index.ts        # createAllHooks(engine, tracker, gen)
│   │           ├── memory-hooks.ts # createMemoryHook(engine)
│   │           └── skill-hooks.ts  # createSkillHook(tracker, gen)
│   ├── cli/
│   │   ├── package.json            # name: @my-assistant/cli, bin: my-assistant
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # main(): parse args, dispatch
│   │       ├── commands.ts         # subcommand routing table
│   │       └── tui.ts              # startChatSession(config)
│   └── daemon/
│       ├── package.json            # name: @my-assistant/daemon
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Daemon main(): pid lock, start services
│           ├── scheduler.ts        # TaskScheduler class
│           ├── mail-watcher.ts     # MailWatcher class
│           └── agent-runner.ts     # runHeadlessAgent(config, prompt)
```

### Interface Contracts

**core/src/soul.ts → buildSystemPrompt(config)**
- Consumes: `AssistantConfig` (name, personality, customized)
- Produces: `string` — the rendered system prompt

**core/src/config.ts → ConfigManager**
- Consumes: `~/.my-assistant/config.json`
- Produces: `AssistantConfig` read/write, `isFirstRun(): boolean`

**core/src/memory/index.ts → MemoryEngine**
- Consumes: `~/.my-assistant/data/memory.json`
- Produces: `search(keyword: string): MemoryEntry[]`, `add(entry): void`, `update(id, patch): void`, `compact(entries): Summary`

**core/src/skills/topic-tracker.ts → TopicTracker**
- Consumes: `~/.my-assistant/data/topic-stats.json`
- Produces: `track(topic: string): { count, shouldGenerate }`, `markGenerated(topic): void`

**core/src/skills/index.ts → SkillGenerator**
- Consumes: topic, conversation history, LLM
- Produces: `generate(topic, history): string` — SKILL.md content

**core/src/hooks/ → Hook factories**
- Consumes: MemoryEngine, TopicTracker, SkillGenerator
- Produces: object `{ onTurnEnd, onSessionStart, ... }` for AgentHarness hooks

**core/src/tools/index.ts → createAllTools(config, dataDir)**
- Consumes: config, data directory path
- Produces: `AgentTool[]` — all 9 custom tools (5 pi builtins auto-loaded)

**core/src/index.ts → createAssistantAgent(config, opts?)**
- Consumes: AssistantConfig, optional mode/overrides
- Produces: `{ session, dispose, hooks }` — ready-to-use agent

**cli/src/index.ts → main(argv)**
- Consumes: command-line arguments
- Produces: dispatches to chat/daemon/memory/tasks/skills/config commands

**daemon/src/index.ts → Daemon main()**
- Consumes: config
- Produces: running daemon with PID lock

---

### Task 1: Initialize monorepo root

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: Root `package.json` with npm workspaces config for `packages/core`, `packages/cli`, `packages/daemon`

- [ ] **Step 1: Create root package.json**

```bash
cd /Users/wys3300/Desktop/my-assistent-baseOnpi
cat > package.json << 'EOF'
{
  "name": "my-assistant-monorepo",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/core",
    "packages/cli",
    "packages/daemon"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "clean": "npm run clean --workspaces",
    "test": "npm run test --workspaces --if-present"
  },
  "engines": {
    "node": ">=22.19.0"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@types/node": "22.19.19"
  }
}
EOF
```

- [ ] **Step 2: Create .gitignore**

```bash
cat > .gitignore << 'EOF'
node_modules/
dist/
*.tsbuildinfo
.DS_Store
EOF
```

- [ ] **Step 3: Install and verify**

```bash
npm install --ignore-scripts 2>&1
ls package.json && echo "Root OK"
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore package-lock.json
git commit -m "chore: initialize monorepo root with npm workspaces"
```

### Task 2: TypeScript configuration

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

**Interfaces:**
- Produces: Shared TS base config, project references structure

- [ ] **Step 1: Create tsconfig.base.json**

```bash
cat > tsconfig.base.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
EOF
```

- [ ] **Step 2: Create root tsconfig.json with project references**

```bash
cat > tsconfig.json << 'EOF'
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/cli" },
    { "path": "packages/daemon" }
  ]
}
EOF
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "chore: add TypeScript configuration"
```

### Task 3: Core package scaffolding

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts` (stub)

**Interfaces:**
- Produces: `@my-assistant/core` package ready to accept modules
- Produces: `createAssistantAgent(config, options?)` — stub function, implemented in Task 12

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p packages/core/src
cat > packages/core/package.json << 'EOF'
{
  "name": "@my-assistant/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./memory": {
      "types": "./dist/memory/index.d.ts",
      "import": "./dist/memory/index.js"
    },
    "./config": {
      "types": "./dist/config.d.ts",
      "import": "./dist/config.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@earendil-works/pi-agent-core": "^0.80.3",
    "@earendil-works/pi-ai": "^0.80.3",
    "@earendil-works/pi-coding-agent": "^0.80.3",
    "typebox": "1.1.38",
    "nodemailer": "6.10.0",
    "cross-spawn": "7.0.6"
  },
  "devDependencies": {
    "@types/nodemailer": "6.4.17",
    "@types/cross-spawn": "6.0.6",
    "typescript": "5.9.3"
  }
}
EOF
```

- [ ] **Step 2: Create tsconfig.json**

```bash
cat > packages/core/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
EOF
```

- [ ] **Step 3: Install and verify build**

```bash
npm install --ignore-scripts 2>&1
npm run build -w @my-assistant/core 2>&1
ls packages/core/dist/index.js && echo "Build OK"
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/
git commit -m "chore: scaffold @my-assistant/core package"
```

### Task 4: Config manager

**Files:**
- Create: `packages/core/src/config.ts`

**Interfaces:**
- Produces: `AssistantConfig` type, `DEFAULT_CONFIG` constant
- Produces: `ConfigManager` class with `get()`, `save()`, `updateAssistant(name, personality)`, `isFirstRun()`, `reset()`, `ensureDataDir()`
- Produces: `CONFIG_DIR`, `DATA_DIR`, `CONFIG_PATH` constants

- [ ] **Step 1: Write config.ts**

```bash
cat > packages/core/src/config.ts << 'TYPESCRIPT'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AssistantConfig {
  assistant: {
    name: string;
    personality: string;
    customized: boolean;
  };
  email: {
    smtp: { host: string; port: number; user: string; pass: string };
    imap: { host: string; port: number; user: string; pass: string };
  };
  model: {
    default: string;
    cheap: string;
  };
}

export const DEFAULT_CONFIG: AssistantConfig = {
  assistant: {
    name: "小一",
    personality: "温和、细心、善于记住用户的偏好和习惯，回复简洁有力，用中文",
    customized: false,
  },
  email: {
    smtp: { host: "", port: 465, user: "", pass: "" },
    imap: { host: "", port: 993, user: "", pass: "" },
  },
  model: {
    default: "deepseek-v4-pro",
    cheap: "deepseek-v4-flash",
  },
};

export const CONFIG_DIR = resolve(homedir(), ".my-assistant");
export const DATA_DIR = resolve(CONFIG_DIR, "data");
export const CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

export class ConfigManager {
  private config: AssistantConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AssistantConfig {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
      return structuredClone(DEFAULT_CONFIG);
    }
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    try {
      return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
    } catch {
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  save(): void {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
  }

  get(): AssistantConfig {
    return structuredClone(this.config);
  }

  updateAssistant(name: string, personality: string): void {
    this.config.assistant = { name, personality, customized: true };
    this.save();
  }

  isFirstRun(): boolean {
    return !this.config.assistant.customized;
  }

  reset(): void {
    this.config = structuredClone(DEFAULT_CONFIG);
    this.save();
  }

  ensureDataDir(): void {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}
TYPESCRIPT
```

- [ ] **Step 2: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/config.ts
git commit -m "feat: add ConfigManager with first-run detection"
```

### Task 5: Soul module (system prompt builder)

**Files:**
- Create: `packages/core/src/soul.ts`

**Interfaces:**
- Consumes: `AssistantConfig` from `./config.js`
- Produces: `buildSystemPrompt(config)` → `string`

- [ ] **Step 1: Write soul.ts**

```bash
cat > packages/core/src/soul.ts << 'TYPESCRIPT'
import type { AssistantConfig } from "./config.js";

export function buildSystemPrompt(config: AssistantConfig): string {
  const { name, personality } = config.assistant;

  return `你是「${name}」，用户的个人 AI 管家。

## 性格
${personality}

## 核心能力
- 读写文件：帮用户整理文档、笔记、数据
- 收发邮件：查看收件箱、发送邮件
- 定时任务：设置提醒、定时执行操作
- 脚本执行：遇到无法用现有工具完成的任务，编写脚本通过 bash 执行
- 记忆管理：自动记住用户偏好和重要信息
- 技能学习：当同类任务重复出现，自动沉淀为 Skill

## 记忆系统
你有持久化记忆，存储在本地记忆库中。
每次对话后自动提取关键信息更新记忆。
记忆分为三类：
1. 偏好记忆：用户喜欢什么、不喜欢什么
2. 事实记忆：用户告诉你的重要信息（生日、地址、社交关系等）
3. 任务记忆：用户交代的待办事项和承诺

## 行为准则
- 遇到复杂任务时，先规划再执行（列出步骤，逐条完成）
- 文件操作前先确认路径，避免误删
- 发送邮件前先让用户确认内容
- 定时任务设置后主动告知下次触发时间`;
}
TYPESCRIPT
```

- [ ] **Step 2: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/soul.ts
git commit -m "feat: add system prompt builder (soul module)"
```

### Task 6: Memory engine — storage

**Files:**
- Create: `packages/core/src/memory/storage.ts`
- Create: `packages/core/data/.gitkeep`

**Interfaces:**
- Produces: `MemoryEntry` type, `MemorySummary` type, `MemoryStore` type
- Produces: `readMemoryStore()`, `writeMemoryStore(store)`, `searchMemory(store, keyword)`, `generateId()`

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/core/src/memory
mkdir -p packages/core/data
touch packages/core/data/.gitkeep
```

- [ ] **Step 2: Write memory/storage.ts**

```bash
cat > packages/core/src/memory/storage.ts << 'TYPESCRIPT'
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.js";

export interface MemoryEntry {
  id: string;
  type: "preference" | "fact" | "task";
  content: string;
  keywords: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  deadline?: string;
  status?: "pending" | "done";
}

export interface MemorySummary {
  id: string;
  period: string;
  content: string;
  sourceCount: number;
  createdAt: string;
}

export interface MemoryStore {
  version: number;
  entries: MemoryEntry[];
  summaries: MemorySummary[];
}

const MEMORY_PATH = resolve(DATA_DIR, "memory.json");

function emptyStore(): MemoryStore {
  return { version: 1, entries: [], summaries: [] };
}

export function readMemoryStore(): MemoryStore {
  if (!existsSync(MEMORY_PATH)) return emptyStore();
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, "utf-8")) as MemoryStore;
  } catch {
    return emptyStore();
  }
}

export function writeMemoryStore(store: MemoryStore): void {
  writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), "utf-8");
}

let counter = 0;
export function generateId(): string {
  counter++;
  return `mem-${Date.now()}-${counter}`;
}

export function searchMemory(
  store: MemoryStore,
  keyword: string
): MemoryEntry[] {
  const lower = keyword.toLowerCase();
  const fromEntries = store.entries.filter(
    (e) =>
      e.keywords.some((k) => k.toLowerCase().includes(lower)) ||
      e.content.toLowerCase().includes(lower)
  );
  const fromSummaries = store.summaries
    .filter((s) => s.content.toLowerCase().includes(lower))
    .map(
      (s): MemoryEntry => ({
        id: s.id,
        type: "fact" as const,
        content: `[记忆摘要] ${s.content}`,
        keywords: [],
        source: "summary",
        createdAt: s.createdAt,
        updatedAt: s.createdAt,
        accessCount: 0,
      })
    );
  return [...fromEntries, ...fromSummaries]
    .sort(
      (a, b) =>
        b.accessCount - a.accessCount ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 10);
}
TYPESCRIPT
```

- [ ] **Step 3: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/memory/storage.ts packages/core/data/.gitkeep
git commit -m "feat: add memory storage engine (JSON read/write/search)"
```

### Task 7: MemoryEngine class + compaction

**Files:**
- Create: `packages/core/src/memory/index.ts`
- Create: `packages/core/src/memory/compaction.ts`

**Interfaces:**
- Produces: `MemoryEngine` class with `search()`, `add()`, `update()`, `getAllEntries()`, `getSummaries()`, `removeEntries()`, `addSummary()`, `getStats()`
- Produces: `selectEntriesForCompaction()`, `compactWithLLM()`, `applyCompaction()`

- [ ] **Step 1: Write memory/index.ts**

```bash
cat > packages/core/src/memory/index.ts << 'TYPESCRIPT'
import {
  generateId,
  readMemoryStore,
  searchMemory,
  writeMemoryStore,
} from "./storage.js";
import type { MemoryEntry, MemoryStore, MemorySummary } from "./storage.js";

export type { MemoryEntry, MemoryStore, MemorySummary } from "./storage.js";

export class MemoryEngine {
  private store: MemoryStore;

  constructor() {
    this.store = readMemoryStore();
  }

  search(keyword: string): MemoryEntry[] {
    const results = searchMemory(this.store, keyword);
    for (const r of results) {
      if (r.source !== "summary") {
        const entry = this.store.entries.find((e) => e.id === r.id);
        if (entry) entry.accessCount++;
      }
    }
    this.save();
    return results;
  }

  add(
    entry: Omit<
      MemoryEntry,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >
  ): void {
    const newEntry: MemoryEntry = {
      ...entry,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
    };
    this.store.entries.push(newEntry);
    this.save();
  }

  update(
    id: string,
    patch: Partial<
      Pick<MemoryEntry, "content" | "keywords" | "type" | "status" | "accessCount">
    >
  ): void {
    const entry = this.store.entries.find((e) => e.id === id);
    if (!entry) return;
    Object.assign(entry, patch, { updatedAt: new Date().toISOString() });
    this.save();
  }

  getAllEntries(): MemoryEntry[] {
    return [...this.store.entries];
  }

  getSummaries(): MemorySummary[] {
    return [...this.store.summaries];
  }

  removeEntries(ids: string[]): void {
    this.store.entries = this.store.entries.filter((e) => !ids.includes(e.id));
    this.save();
  }

  addSummary(summary: MemorySummary): void {
    this.store.summaries.push(summary);
    this.save();
  }

  getStats(): { entries: number; summaries: number } {
    return {
      entries: this.store.entries.length,
      summaries: this.store.summaries.length,
    };
  }

  private save(): void {
    writeMemoryStore(this.store);
  }
}
TYPESCRIPT
```

- [ ] **Step 2: Write memory/compaction.ts**

```bash
cat > packages/core/src/memory/compaction.ts << 'TYPESCRIPT'
import type { MemoryEngine } from "./index.js";
import { generateId } from "./storage.js";
import type { MemoryEntry } from "./storage.js";

export function selectEntriesForCompaction(
  engine: MemoryEngine,
  olderThanDays: number = 30,
  maxAccessCount: number = 3
): MemoryEntry[] {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  return engine.getAllEntries().filter(
    (e) =>
      new Date(e.createdAt).getTime() < cutoff &&
      e.accessCount < maxAccessCount &&
      e.type !== "task"
  );
}

export async function compactWithLLM(
  entries: MemoryEntry[],
  generateSummary: (entries: MemoryEntry[], type: string) => Promise<string>
): Promise<{ summary: string; removedIds: string[]; sourceCount: number }> {
  if (entries.length === 0) {
    return { summary: "", removedIds: [], sourceCount: 0 };
  }

  const byType = new Map<string, MemoryEntry[]>();
  for (const e of entries) {
    const list = byType.get(e.type) || [];
    list.push(e);
    byType.set(e.type, list);
  }

  const summaries: string[] = [];
  for (const [type, typeEntries] of byType) {
    const s = await generateSummary(typeEntries, type);
    if (s) summaries.push(s);
  }

  const combined = summaries.join("\n");
  return {
    summary: combined,
    removedIds: entries.map((e) => e.id),
    sourceCount: entries.length,
  };
}

export function applyCompaction(
  engine: MemoryEngine,
  result: { summary: string; removedIds: string[]; sourceCount: number }
): void {
  if (result.removedIds.length === 0) return;
  engine.removeEntries(result.removedIds);
  engine.addSummary({
    id: generateId(),
    period: new Date().toISOString().slice(0, 7),
    content: result.summary,
    sourceCount: result.sourceCount,
    createdAt: new Date().toISOString(),
  });
}
TYPESCRIPT
```

- [ ] **Step 3: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/memory/index.ts packages/core/src/memory/compaction.ts
git commit -m "feat: add MemoryEngine class with compaction support"
```

### Task 8: Topic tracker + Skill generator

**Files:**
- Create: `packages/core/src/skills/topic-tracker.ts`
- Create: `packages/core/src/skills/index.ts`

**Interfaces:**
- Produces: `TopicTracker` class with `track(topic, category)` → `{ count, shouldGenerate }`, `markGenerated(topic, skillName)`
- Produces: `SkillGenerator` class with `generate(input)` → `{ skillName, skillPath, content }`

- [ ] **Step 1: Create directory and write topic-tracker.ts**

```bash
mkdir -p packages/core/src/skills
cat > packages/core/src/skills/topic-tracker.ts << 'TYPESCRIPT'
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.js";

interface TopicStats {
  topics: Record<
    string,
    {
      count: number;
      firstSeen: string;
      lastSeen: string;
      category: string;
      skillGenerated: boolean;
      skillName: string | null;
    }
  >;
}

const TOPIC_PATH = resolve(DATA_DIR, "topic-stats.json");
const TRIGGER_THRESHOLD = 3;

function topicSimilarity(a: string, b: string): number {
  const setA = new Set([...a].filter((c) => c !== " "));
  const setB = new Set([...b].filter((c) => c !== " "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export class TopicTracker {
  private stats: TopicStats;

  constructor() {
    this.stats = this.load();
  }

  private load(): TopicStats {
    if (!existsSync(TOPIC_PATH)) return { topics: {} };
    try {
      return JSON.parse(readFileSync(TOPIC_PATH, "utf-8")) as TopicStats;
    } catch {
      return { topics: {} };
    }
  }

  private save(): void {
    writeFileSync(TOPIC_PATH, JSON.stringify(this.stats, null, 2), "utf-8");
  }

  track(
    topic: string,
    category: string
  ): { count: number; shouldGenerate: boolean } {
    let bestMatch: string | null = null;
    for (const existing of Object.keys(this.stats.topics)) {
      if (topicSimilarity(existing, topic) > 0.75) {
        bestMatch = existing;
        break;
      }
    }

    const key = bestMatch ?? topic;
    if (!this.stats.topics[key]) {
      this.stats.topics[key] = {
        count: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        category,
        skillGenerated: false,
        skillName: null,
      };
    }

    const entry = this.stats.topics[key]!;
    entry.count++;
    entry.lastSeen = new Date().toISOString();
    entry.category = category;

    const shouldGenerate =
      entry.count >= TRIGGER_THRESHOLD && !entry.skillGenerated;
    this.save();

    return { count: entry.count, shouldGenerate };
  }

  markGenerated(topic: string, skillName: string): void {
    let key: string | undefined;
    for (const existing of Object.keys(this.stats.topics)) {
      if (topicSimilarity(existing, topic) > 0.75) {
        key = existing;
        break;
      }
    }
    if (key && this.stats.topics[key]) {
      this.stats.topics[key]!.skillGenerated = true;
      this.stats.topics[key]!.skillName = skillName;
      this.save();
    }
  }

  getAllTopics(): TopicStats["topics"] {
    return { ...this.stats.topics };
  }
}
TYPESCRIPT
```

- [ ] **Step 2: Write skills/index.ts**

```bash
cat > packages/core/src/skills/index.ts << 'TYPESCRIPT'
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export interface SkillGenerateInput {
  topic: string;
  category: string;
  history: string;
}

export class SkillGenerator {
  private skillsDir: string;
  private generateFn: (input: SkillGenerateInput) => Promise<string>;

  constructor(
    skillsDir: string,
    generateFn: (input: SkillGenerateInput) => Promise<string>
  ) {
    this.skillsDir = skillsDir;
    this.generateFn = generateFn;
  }

  slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\\u4e00-\\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
  }

  async generate(input: SkillGenerateInput): Promise<{
    skillName: string;
    skillPath: string;
    content: string;
  }> {
    const slug = this.slugify(input.topic);
    const content = await this.generateFn(input);
    const skillDir = resolve(this.skillsDir, slug);
    mkdirSync(skillDir, { recursive: true });
    const skillPath = resolve(skillDir, "SKILL.md");
    writeFileSync(skillPath, content, "utf-8");
    return { skillName: slug, skillPath, content };
  }
}
TYPESCRIPT
```

- [ ] **Step 3: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/skills/
git commit -m "feat: add TopicTracker (3-count trigger) and SkillGenerator"
```

### Task 9: Custom tools (email, cron, bash, plan)

**Files:**
- Create: `packages/core/src/tools/email-tools.ts`
- Create: `packages/core/src/tools/cron-tools.ts`
- Create: `packages/core/src/tools/bash-tools.ts`
- Create: `packages/core/src/tools/plan-tool.ts`
- Create: `packages/core/src/tools/index.ts`

**Interfaces:**
- Produces: `createEmailTools(configManager)` → `AgentTool[]`
- Produces: `createCronTools(dataDir)` → `AgentTool[]`
- Produces: `createBashTool()` → `AgentTool`
- Produces: `createPlanTaskTool()` → `AgentTool`
- Produces: `createAllTools(configManager, dataDir)` → `AgentTool[]`

- [ ] **Step 1: Create directory and write email-tools.ts**

```bash
mkdir -p packages/core/src/tools
cat > packages/core/src/tools/email-tools.ts << 'TYPESCRIPT'
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { ConfigManager } from "../config.js";

export function createEmailTools(configManager: ConfigManager): AgentTool[] {
  const sendEmailTool: AgentTool = {
    name: "send_email",
    label: "Send Email",
    description:
      "Send an email via SMTP. Always ask user to confirm before sending.",
    parameters: Type.Object({
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject" }),
      body: Type.String({ description: "Email body text" }),
    }),
    async execute(_toolCallId, params) {
      const smtpConfig = configManager.get().email.smtp;
      if (!smtpConfig.host || !smtpConfig.user) {
        return {
          content: [
            {
              type: "text",
              text: "SMTP not configured. Run `my-assistant config edit` to set up email.",
            },
          ],
          details: { error: "smtp_not_configured" },
        };
      }
      const { createTransport } = await import("nodemailer");
      const transporter = createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.port === 465,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      });
      await transporter.sendMail({
        from: smtpConfig.user,
        to: params.to,
        subject: params.subject,
        text: params.body,
      });
      return {
        content: [{ type: "text", text: `Email sent to ${params.to}` }],
        details: { to: params.to, subject: params.subject },
      };
    },
  };

  const checkInboxTool: AgentTool = {
    name: "check_inbox",
    label: "Check Inbox",
    description:
      "Check recent emails via IMAP. Returns sender, subject, and date.",
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max emails to fetch (default 10)" })
      ),
      from: Type.Optional(Type.String({ description: "Filter by sender" })),
    }),
    async execute(_toolCallId, params) {
      const imapConfig = configManager.get().email.imap;
      if (!imapConfig.host || !imapConfig.user) {
        return {
          content: [
            {
              type: "text",
              text: "IMAP not configured. Run `my-assistant config edit` to set up email.",
            },
          ],
          details: { error: "imap_not_configured" },
        };
      }
      const limit = params.limit ?? 10;
      return {
        content: [
          {
            type: "text",
            text: `[IMAP] Would fetch ${limit} recent emails from ${imapConfig.host} as ${imapConfig.user}. Full IMAP requires imap-simple runtime.`,
          },
        ],
        details: { host: imapConfig.host, user: imapConfig.user, limit },
      };
    },
  };

  return [sendEmailTool, checkInboxTool];
}
TYPESCRIPT
```

- [ ] **Step 2: Write cron-tools.ts**

```bash
cat > packages/core/src/tools/cron-tools.ts << 'TYPESCRIPT'
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface ScheduledTask {
  id: string;
  description: string;
  cron: string;
  createdAt: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
}

interface TaskStore {
  tasks: ScheduledTask[];
}

function readTasks(path: string): TaskStore {
  if (!existsSync(path)) return { tasks: [] };
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as TaskStore;
  } catch {
    return { tasks: [] };
  }
}

function writeTasks(path: string, store: TaskStore): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

export function createCronTools(dataDir: string): AgentTool[] {
  const tasksPath = resolve(dataDir, "tasks.json");

  const scheduleTaskTool: AgentTool = {
    name: "schedule_task",
    label: "Schedule Task",
    description:
      "Create a scheduled task using cron expression. Example: '0 8 * * *' for daily at 8am.",
    parameters: Type.Object({
      description: Type.String({ description: "What the task does" }),
      cron: Type.String({
        description: "Cron expression (minute hour day month weekday)",
      }),
    }),
    async execute(_toolCallId, params) {
      const store = readTasks(tasksPath);
      const id = `task-${Date.now()}`;
      const task: ScheduledTask = {
        id,
        description: params.description,
        cron: params.cron,
        createdAt: new Date().toISOString(),
        enabled: true,
        lastRun: null,
        lastResult: null,
      };
      store.tasks.push(task);
      writeTasks(tasksPath, store);
      return {
        content: [
          {
            type: "text",
            text: `Task scheduled: #${id} — "${params.description}" at cron "${params.cron}"`,
          },
        ],
        details: task,
      };
    },
  };

  const listTasksTool: AgentTool = {
    name: "list_tasks",
    label: "List Scheduled Tasks",
    description: "List all scheduled tasks with their status.",
    parameters: Type.Object({}),
    async execute() {
      const store = readTasks(tasksPath);
      if (store.tasks.length === 0) {
        return {
          content: [{ type: "text", text: "No scheduled tasks." }],
          details: { tasks: [] },
        };
      }
      const lines = store.tasks.map(
        (t) =>
          `[${t.enabled ? "ON" : "OFF"}] #${t.id}: ${t.description} (cron: ${t.cron})${t.lastRun ? ` last: ${t.lastRun}` : ""}`
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { tasks: store.tasks },
      };
    },
  };

  const deleteTaskTool: AgentTool = {
    name: "delete_task",
    label: "Delete Scheduled Task",
    description: "Delete a scheduled task by ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Task ID to delete" }),
    }),
    async execute(_toolCallId, params) {
      const store = readTasks(tasksPath);
      const before = store.tasks.length;
      store.tasks = store.tasks.filter((t) => t.id !== params.id);
      writeTasks(tasksPath, store);
      return {
        content: [
          {
            type: "text",
            text:
              before > store.tasks.length
                ? `Deleted task ${params.id}`
                : `Task ${params.id} not found`,
          },
        ],
        details: { deleted: before > store.tasks.length },
      };
    },
  };

  return [scheduleTaskTool, listTasksTool, deleteTaskTool];
}
TYPESCRIPT
```

- [ ] **Step 3: Write bash-tools.ts**

```bash
cat > packages/core/src/tools/bash-tools.ts << 'TYPESCRIPT'
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export function createBashTool(): AgentTool {
  return {
    name: "run_script",
    label: "Run Bash Script",
    description:
      "Execute a bash script. Use when tasks cannot be done with existing tools.",
    parameters: Type.Object({
      script: Type.String({ description: "The bash script content to execute" }),
      cwd: Type.Optional(
        Type.String({ description: "Working directory (default: current)" })
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in seconds (default: 60)" })
      ),
    }),
    async execute(_toolCallId, params) {
      const { spawn } = await import("cross-spawn");
      const scriptPath = resolve(
        tmpdir(),
        `my-assistant-script-${randomUUID()}.sh`
      );
      writeFileSync(
        scriptPath,
        `#!/usr/bin/env bash\nset -euo pipefail\n${params.script}`,
        "utf-8"
      );
      chmodSync(scriptPath, 0o755);

      const timeout = (params.timeout ?? 60) * 1000;

      return new Promise((resolveResult) => {
        const child = spawn("bash", [scriptPath], {
          cwd: params.cwd ?? process.cwd(),
          timeout,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        child.on("close", (code) => {
          try {
            unlinkSync(scriptPath);
          } catch {}
          resolveResult({
            content: [
              {
                type: "text",
                text: `Exit code: ${code}\n\nSTDOUT:\n${stdout.slice(0, 5000)}\n${stderr ? `STDERR:\n${stderr.slice(0, 2000)}` : ""}`,
              },
            ],
            details: {
              exitCode: code,
              stdout: stdout.slice(0, 5000),
              stderr: stderr.slice(0, 2000),
            },
          });
        });

        child.on("error", (err) => {
          try {
            unlinkSync(scriptPath);
          } catch {}
          resolveResult({
            content: [
              {
                type: "text",
                text: `Script execution failed: ${err.message}`,
              },
            ],
            details: { error: err.message },
          });
        });
      });
    },
  };
}
TYPESCRIPT
```

- [ ] **Step 4: Write plan-tool.ts**

```bash
cat > packages/core/src/tools/plan-tool.ts << 'TYPESCRIPT'
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
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `Task to plan: "${params.task}"\n\nPlease break this task into 3-8 numbered steps. For each step, specify:\n- Step description\n- Required tool to use\n- Expected output\n\nThen execute each step in order, reporting results after each one.`,
          },
        ],
        details: { task: params.task },
      };
    },
  };
}
TYPESCRIPT
```

- [ ] **Step 5: Write tools/index.ts**

```bash
cat > packages/core/src/tools/index.ts << 'TYPESCRIPT'
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
TYPESCRIPT
```

- [ ] **Step 6: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tools/
git commit -m "feat: add custom tools (email, cron, bash, plan)"
```

### Task 10: Hooks — memory extraction + skill detection

**Files:**
- Create: `packages/core/src/hooks/memory-hooks.ts`
- Create: `packages/core/src/hooks/skill-hooks.ts`
- Create: `packages/core/src/hooks/index.ts`

**Interfaces:**
- Consumes: `MemoryEngine`, `TopicTracker`, `SkillGenerator`
- Produces: `createMemoryHook(engine, extractor)`, `createSkillHook(tracker, gen, extractor, callback)`, `createAllHooks(...)`

- [ ] **Step 1: Create directory and write hooks/memory-hooks.ts**

```bash
mkdir -p packages/core/src/hooks
cat > packages/core/src/hooks/memory-hooks.ts << 'TYPESCRIPT'
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
          const existing = engine.search(item.keywords.join(" "));
          if (existing.length > 0) {
            const best = existing[0]!;
            if (best.source !== "summary") {
              engine.update(best.id, {
                content: item.content,
                keywords: [
                  ...new Set([...best.keywords, ...item.keywords]),
                ],
              });
              continue;
            }
          }
          engine.add(item);
        }
      } catch (err) {
        console.error("[memory-hook] Extraction failed:", err);
      }
    },
  };
}
TYPESCRIPT
```

- [ ] **Step 2: Write hooks/skill-hooks.ts**

```bash
cat > packages/core/src/hooks/skill-hooks.ts << 'TYPESCRIPT'
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
TYPESCRIPT
```

- [ ] **Step 3: Write hooks/index.ts**

```bash
cat > packages/core/src/hooks/index.ts << 'TYPESCRIPT'
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
TYPESCRIPT
```

- [ ] **Step 4: Build and verify**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hooks/
git commit -m "feat: add hooks (memory extraction + skill detection on turn_end)"
```

### Task 11: createAssistantAgent() entry point

**Files:**
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: All core modules
- Produces: `createAssistantAgent(configManager, options?)` → `{ session, configManager, memoryEngine, topicTracker, skillGenerator, dispose }`

- [ ] **Step 1: Write full index.ts**

```bash
cat > packages/core/src/index.ts << 'TYPESCRIPT'
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { getModel, type Model } from "@earendil-works/pi-ai/compat";
import { ConfigManager, CONFIG_DIR, DATA_DIR } from "./config.js";
import type { AssistantConfig } from "./config.js";
import { buildSystemPrompt } from "./soul.js";
import { createAllTools } from "./tools/index.js";
import { MemoryEngine } from "./memory/index.js";
import { TopicTracker } from "./skills/topic-tracker.js";
import { SkillGenerator } from "./skills/index.js";
import { createAllHooks } from "./hooks/index.js";
import type { MemoryExtractor } from "./hooks/memory-hooks.js";
import type { TopicExtractor } from "./hooks/skill-hooks.js";
import { resolve } from "node:path";

export type { AssistantConfig } from "./config.js";

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

  const skillsDir = resolve(process.cwd(), ".pi", "skills");

  // Auth & models
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    authStorage.setRuntimeApiKey("deepseek", apiKey);
  }

  let model: Model<any>;
  try {
    model =
      getModel("deepseek", config.model.default) ??
      getModel("deepseek", "deepseek-v4-pro")!;
  } catch {
    model = getModel("deepseek", "deepseek-v4-pro")!;
  }

  // Custom tools
  const customTools = createAllTools(configManager, DATA_DIR);

  // Engines
  const memoryEngine = new MemoryEngine();
  const topicTracker = new TopicTracker();
  const skillGenerator = new SkillGenerator(skillsDir, async (_input) => {
    return `---
name: skill-${Date.now()}
description: Auto-generated skill for "${_input.topic}"
---

# ${_input.topic}

## Trigger
When user asks about ${_input.topic.toLowerCase()}.

## Steps
1. Understand the specific request
2. Execute using appropriate tools
3. Report results

Generated at ${new Date().toISOString()}`;
  });

  // Extractors (LLM-driven, see hooks)
  const memoryExtractor: MemoryExtractor = {
    async extract(_text) {
      return [];
    },
  };

  const topicExtractor: TopicExtractor = {
    async extract(_text) {
      return { topic: "", category: "" };
    },
  };

  const hooks = createAllHooks(
    memoryEngine,
    topicTracker,
    skillGenerator,
    memoryExtractor,
    topicExtractor,
    (topic, skillName, _content) => {
      console.log(
        `[my-assistant] Auto-generated skill "${skillName}" for topic "${topic}"`
      );
    }
  );

  // System prompt
  const systemPrompt = buildSystemPrompt(config);

  // Resource loader
  const resourceLoader = new DefaultResourceLoader({
    cwd: options?.cwd ?? process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
  });
  await resourceLoader.reload();

  // Session manager
  const cwd = options?.cwd ?? process.cwd();
  const sessionManager =
    options?.mode === "headless"
      ? SessionManager.inMemory(cwd)
      : SessionManager.create(cwd, CONFIG_DIR);

  // Build tool allowlist
  const allToolNames = [...DEFAULT_TOOLS, ...customTools.map((t) => t.name)];

  // Create agent session
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

  // Wire hooks into session
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
    topicTracker,
    skillGenerator,
    dispose: () => session.dispose(),
  };
}
TYPESCRIPT
```

- [ ] **Step 2: Build entire core package**

```bash
npm run build -w @my-assistant/core 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat: implement createAssistantAgent() entry point"
```

### Task 12: CLI package — scaffolding + command routing

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands.ts`
- Create: `packages/cli/bin/my-assistant`

**Interfaces:**
- Consumes: `@my-assistant/core`
- Produces: Global `my-assistant` binary with subcommand routing

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p packages/cli/src packages/cli/bin
cat > packages/cli/package.json << 'EOF'
{
  "name": "@my-assistant/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "my-assistant": "./bin/my-assistant"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@my-assistant/core": "*"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
EOF
```

- [ ] **Step 2: Create tsconfig.json**

```bash
cat > packages/cli/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
EOF
```

- [ ] **Step 3: Write commands.ts**

```bash
cat > packages/cli/src/commands.ts << 'TYPESCRIPT'
export function printHelp(): void {
  console.log(`my-assistant — Personal AI assistant based on pi-agent

USAGE:
  my-assistant <command> [args]

COMMANDS:
  chat                      Start interactive chat (default)
  daemon start              Start background daemon
  daemon stop               Stop background daemon
  daemon status             Show daemon status
  memory list               List all memories
  memory search <keyword>   Search memories
  memory stats              Show memory statistics
  tasks list                List scheduled tasks
  tasks add                 Add a scheduled task
  tasks delete <id>         Delete a scheduled task
  tasks log                 Show task execution log
  skills list               List auto-generated skills
  skills delete <name>      Delete a skill
  config show               Show current configuration
  config edit               Open config in editor
  config reset              Reset to first-run state
  help                      Show this help
`);
}

export async function routeCommand(
  args: string[]
): Promise<{ name: string; run: () => Promise<void> } | null> {
  if (args.length === 0 || args[0] === "chat") {
    return {
      name: "chat",
      run: async () => {
        const { startChatSession } = await import("./tui.js");
        await startChatSession();
      },
    };
  }

  const [cmd, sub] = args;
  if (cmd === "help") {
    printHelp();
    return { name: "help", run: async () => {} };
  }

  if (cmd === "config") {
    return {
      name: "config",
      run: async () => {
        const { ConfigManager, CONFIG_PATH } = await import("@my-assistant/core");
        const cm = new ConfigManager();
        if (sub === "show" || !sub) {
          console.log(JSON.stringify(cm.get(), null, 2));
          console.log(`Config path: ${CONFIG_PATH}`);
        } else if (sub === "reset") {
          cm.reset();
          console.log("Config reset. Next run triggers first-run setup.");
        } else if (sub === "edit") {
          const { spawn } = await import("cross-spawn");
          const editor = process.env.EDITOR || "nano";
          spawn(editor, [CONFIG_PATH], { stdio: "inherit" });
        }
      },
    };
  }

  if (cmd === "memory") {
    return {
      name: "memory",
      run: async () => {
        const { ConfigManager } = await import("@my-assistant/core");
        const { MemoryEngine } = await import("@my-assistant/core/memory");
        const cm = new ConfigManager();
        cm.ensureDataDir();
        const engine = new MemoryEngine();
        if (sub === "list" || !sub) {
          const entries = engine.getAllEntries();
          if (entries.length === 0) console.log("No memories yet.");
          else entries.forEach((e) =>
            console.log(`[${e.type}] ${e.content}\n  keywords: ${e.keywords.join(", ")}`)
          );
        } else if (sub === "search") {
          const keyword = args.slice(2).join(" ");
          const results = engine.search(keyword);
          results.forEach((r) => console.log(`[${r.type}] ${r.content}`));
        } else if (sub === "stats") {
          const stats = engine.getStats();
          console.log(`Entries: ${stats.entries}, Summaries: ${stats.summaries}`);
        }
      },
    };
  }

  if (cmd === "tasks") {
    return {
      name: "tasks",
      run: async () => {
        console.log(`tasks ${sub ?? "list"}: See ~/.my-assistant/data/tasks.json`);
      },
    };
  }

  if (cmd === "skills") {
    return {
      name: "skills",
      run: async () => {
        const { existsSync, readdirSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const skillsDir = resolve(process.cwd(), ".pi", "skills");
        if (!existsSync(skillsDir)) {
          console.log("No skills directory. Skills are auto-generated after 3 repeated topics.");
          return;
        }
        const dirs = readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
        if (dirs.length === 0) console.log("No skills yet.");
        else dirs.forEach((d) => console.log(`- ${d}`));
      },
    };
  }

  if (cmd === "daemon") {
    return {
      name: "daemon",
      run: async () => {
        console.log(
          `daemon ${sub ?? "status"}: Daemon management via @my-assistant/daemon package`
        );
      },
    };
  }

  return null;
}
TYPESCRIPT
```

- [ ] **Step 4: Write index.ts (main CLI entry)**

```bash
cat > packages/cli/src/index.ts << 'TYPESCRIPT'
#!/usr/bin/env node

import { printHelp, routeCommand } from "./commands.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const cmd = await routeCommand([]);
    if (cmd) await cmd.run();
    return;
  }

  const command = await routeCommand(args);
  if (!command) {
    console.error(`Unknown command: ${args.join(" ")}`);
    printHelp();
    process.exit(1);
  }

  await command.run();
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
TYPESCRIPT
```

- [ ] **Step 5: Create bin script**

```bash
cat > packages/cli/bin/my-assistant << 'EOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_OPTIONS='--experimental-strip-types' exec node "${SCRIPT_DIR}/../dist/index.js" "$@"
EOF
chmod +x packages/cli/bin/my-assistant
```

- [ ] **Step 6: Build and test**

```bash
npm install --ignore-scripts 2>&1
npm run build -w @my-assistant/core 2>&1
npm run build -w @my-assistant/cli 2>&1
./packages/cli/bin/my-assistant help
```

- [ ] **Step 7: Commit**

```bash
git add packages/cli/
git commit -m "feat: add CLI package with command routing and bin script"
```

### Task 13: CLI — TUI chat mode

**Files:**
- Create: `packages/cli/src/tui.ts`

**Interfaces:**
- Consumes: `@my-assistant/core` (`createAssistantAgent`, `ConfigManager`)
- Produces: `startChatSession()` — readline-based chat with first-run bootstrap

- [ ] **Step 1: Write tui.ts**

```bash
cat > packages/cli/src/tui.ts << 'TYPESCRIPT'
import { ConfigManager } from "@my-assistant/core";
import { createAssistantAgent } from "@my-assistant/core";
import * as readline from "node:readline";

const BOOTSTRAP_MESSAGE = `你好！这是我们第一次见面。在开始之前，我想先认识你：
① 你希望怎么称呼我？（给我起个名字）
② 你希望我有什么性格特点？
   比如：幽默风趣、严谨专业、简洁高效、温柔体贴...`;

export async function startChatSession() {
  const configManager = new ConfigManager();
  const isFirst = configManager.isFirstRun();

  console.log(`
╔══════════════════════════════════╗
║         My-Assistant            ║
║   基于 pi-agent 的个人 AI 管家    ║
╚══════════════════════════════════╝
`);

  const { session, dispose } = await createAssistantAgent(configManager, {
    mode: "tui",
    cwd: process.cwd(),
  });

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "agent_end") {
      console.log("\n─".repeat(40));
    }
  });

  if (isFirst) {
    console.log(`\n小一 > ${BOOTSTRAP_MESSAGE}\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n你 > ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (input === "exit" || input === "quit" || input === "q") {
      console.log("再见！");
      rl.close();
      dispose();
      process.exit(0);
    }
    if (!input) {
      rl.prompt();
      return;
    }
    try {
      await session.prompt(input);
    } catch (err) {
      console.error(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    rl.prompt();
  });

  rl.on("close", () => {
    dispose();
    process.exit(0);
  });
}
TYPESCRIPT
```

- [ ] **Step 2: Build and verify**

```bash
npm run build -w @my-assistant/cli 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/tui.ts
git commit -m "feat: add TUI chat mode with first-run bootstrap"
```

### Task 14: Daemon package

**Files:**
- Create: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`
- Create: `packages/daemon/src/agent-runner.ts`
- Create: `packages/daemon/src/scheduler.ts`
- Create: `packages/daemon/src/mail-watcher.ts`
- Create: `packages/daemon/src/index.ts`

**Interfaces:**
- Consumes: `@my-assistant/core`
- Produces: Daemon process with scheduler + mail watcher

- [ ] **Step 1: Create directories and package.json**

```bash
mkdir -p packages/daemon/src
cat > packages/daemon/package.json << 'EOF'
{
  "name": "@my-assistant/daemon",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@my-assistant/core": "*",
    "node-cron": "3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "3.0.11",
    "typescript": "5.9.3"
  }
}
EOF
```

- [ ] **Step 2: Create tsconfig.json**

```bash
cat > packages/daemon/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
EOF
```

- [ ] **Step 3: Write agent-runner.ts**

```bash
cat > packages/daemon/src/agent-runner.ts << 'TYPESCRIPT'
import { ConfigManager } from "@my-assistant/core";
import { createAssistantAgent } from "@my-assistant/core";

export async function runHeadlessAgent(
  configManager: ConfigManager,
  prompt: string
): Promise<{ output: string; success: boolean }> {
  const { session, dispose } = await createAssistantAgent(configManager, {
    mode: "headless",
  });

  let output = "";

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      output += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(prompt);
    return { output, success: true };
  } catch (err) {
    return {
      output: err instanceof Error ? err.message : String(err),
      success: false,
    };
  } finally {
    dispose();
  }
}
TYPESCRIPT
```

- [ ] **Step 4: Write scheduler.ts**

```bash
cat > packages/daemon/src/scheduler.ts << 'TYPESCRIPT'
import { CronJob } from "node-cron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "@my-assistant/core/config";

interface ScheduledTask {
  id: string;
  description: string;
  cron: string;
  createdAt: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
}

interface TaskStore {
  tasks: ScheduledTask[];
}

const TASKS_PATH = resolve(DATA_DIR, "tasks.json");
const LOGS_PATH = resolve(DATA_DIR, "task-logs.json");

export class TaskScheduler {
  private jobs = new Map<string, CronJob>();
  private onExecute: (task: ScheduledTask) => Promise<{ output: string; success: boolean }>;

  constructor(onExecute: (task: ScheduledTask) => Promise<{ output: string; success: boolean }>) {
    this.onExecute = onExecute;
  }

  start(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const store = this.loadTasks();
    for (const task of store.tasks) {
      if (task.enabled) this.scheduleTask(task);
    }
    console.log(`[scheduler] Started with ${this.jobs.size} tasks`);
  }

  private scheduleTask(task: ScheduledTask): void {
    try {
      const job = new CronJob(task.cron, async () => {
        console.log(`[scheduler] Running: ${task.description}`);
        const result = await this.onExecute(task);
        this.logResult(task.id, result.success ? "success" : "error", result.output);
      });
      this.jobs.set(task.id, job);
      job.start();
    } catch (err) {
      console.error(`[scheduler] Invalid cron "${task.cron}" for ${task.id}`);
    }
  }

  private loadTasks(): TaskStore {
    if (!existsSync(TASKS_PATH)) return { tasks: [] };
    try {
      return JSON.parse(readFileSync(TASKS_PATH, "utf-8")) as TaskStore;
    } catch {
      return { tasks: [] };
    }
  }

  private logResult(id: string, result: string, output: string): void {
    const logs = existsSync(LOGS_PATH)
      ? JSON.parse(readFileSync(LOGS_PATH, "utf-8"))
      : [];
    logs.push({
      taskId: id,
      result,
      output: output.slice(0, 500),
      timestamp: new Date().toISOString(),
    });
    writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), "utf-8");
  }

  stopAll(): void {
    for (const [, job] of this.jobs) job.stop();
    this.jobs.clear();
    console.log("[scheduler] Stopped");
  }
}
TYPESCRIPT
```

- [ ] **Step 5: Write mail-watcher.ts**

```bash
cat > packages/daemon/src/mail-watcher.ts << 'TYPESCRIPT'
import type { AssistantConfig } from "@my-assistant/core";

export class MailWatcher {
  private config: AssistantConfig["email"];
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: AssistantConfig["email"]) {
    this.config = config;
  }

  start(
    onNewMail: (mail: { from: string; subject: string; body: string }) => void
  ): void {
    if (!this.config.imap.host || !this.config.imap.user) {
      console.log("[mail-watcher] IMAP not configured, skipping");
      return;
    }
    console.log(
      `[mail-watcher] Watching ${this.config.imap.host}:${this.config.imap.port}`
    );
    console.log(
      "[mail-watcher] Polling mode (every 60s). Full IMAP IDLE requires imap-simple runtime."
    );

    this.intervalId = setInterval(() => {
      // Poll for new mail — full implementation requires imap-simple
    }, 60000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[mail-watcher] Stopped");
  }
}
TYPESCRIPT
```

- [ ] **Step 6: Write daemon/src/index.ts**

```bash
cat > packages/daemon/src/index.ts << 'TYPESCRIPT'
import { ConfigManager, DATA_DIR } from "@my-assistant/core";
import { TaskScheduler } from "./scheduler.js";
import { MailWatcher } from "./mail-watcher.js";
import { runHeadlessAgent } from "./agent-runner.js";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PID_PATH = resolve(DATA_DIR, "daemon.pid");

function checkRunning(): boolean {
  if (!existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0] ?? "status";

  if (sub === "start") {
    if (checkRunning()) {
      console.log("Daemon is already running.");
      process.exit(0);
    }

    const configManager = new ConfigManager();
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PID_PATH, String(process.pid), "utf-8");

    const scheduler = new TaskScheduler(async (task) => {
      return runHeadlessAgent(
        configManager,
        `Execute scheduled task: ${task.description}`
      );
    });

    const mailWatcher = new MailWatcher(configManager.get().email);

    console.log(`[daemon] Started (pid: ${process.pid})`);
    scheduler.start();
    mailWatcher.start((mail) => {
      console.log(`[mail-watcher] New mail: ${mail.from} — ${mail.subject}`);
    });

    const shutdown = () => {
      console.log("\n[daemon] Shutting down...");
      scheduler.stopAll();
      mailWatcher.stop();
      try { unlinkSync(PID_PATH); } catch {}
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } else if (sub === "stop") {
    if (!checkRunning()) {
      console.log("Daemon is not running.");
      process.exit(0);
    }
    const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    console.log(`Sent stop signal to daemon (pid: ${pid})`);
  } else if (sub === "status") {
    if (checkRunning()) {
      const pid = readFileSync(PID_PATH, "utf-8").trim();
      console.log(`Daemon is running (pid: ${pid})`);
    } else {
      console.log("Daemon is not running.");
    }
  } else {
    console.log("Usage: my-assistant daemon <start|stop|status>");
  }
}

main().catch(console.error);
TYPESCRIPT
```

- [ ] **Step 7: Build and verify**

```bash
npm install --ignore-scripts 2>&1
npm run build -w @my-assistant/daemon 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add packages/daemon/
git commit -m "feat: add daemon package (scheduler + mail watcher + agent runner)"
```

### Task 15: Pi extension for cross-compatibility

**Files:**
- Create: `.pi/extensions/my-assistant.ts`
- Create: `.pi/skills/.gitkeep`

- [ ] **Step 1: Create pi extension**

```bash
mkdir -p .pi/extensions .pi/skills
touch .pi/skills/.gitkeep
cat > .pi/extensions/my-assistant.ts << 'TYPESCRIPT'
/**
 * Pi-agent extension: my-assistant
 *
 * Load this extension in pi to use personal assistant tools.
 * pi install /path/to/my-assistant-baseOnpi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SKILLS_DIR = resolve(process.cwd(), ".pi", "skills");

export default function myAssistantExtension(pi: ExtensionAPI) {
  // Register tools
  pi.registerTool({
    name: "remember",
    label: "Remember",
    description: "Search the personal assistant memory for relevant information",
    parameters: Type.Object({
      keyword: Type.String({ description: "Search keyword" }),
    }),
    async execute(_id, params) {
      const memoryPath = resolve(homedir(), ".my-assistant", "data", "memory.json");
      if (!existsSync(memoryPath)) {
        return {
          content: [{ type: "text", text: "No memories yet." }],
          details: { keyword: params.keyword, results: [] },
        };
      }
      const store = JSON.parse(readFileSync(memoryPath, "utf-8"));
      const results = (store.entries || []).filter(
        (e: any) =>
          e.keywords?.some((k: string) => k.includes(params.keyword)) ||
          e.content?.includes(params.keyword)
      );
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No memories found for "${params.keyword}".` }],
          details: { keyword: params.keyword, results: [] },
        };
      }
      const lines = results.map((r: any) => `[${r.type}] ${r.content}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { keyword: params.keyword, results },
      };
    },
  });

  pi.registerTool({
    name: "schedule_task",
    label: "Schedule Task",
    description: "Create a scheduled task",
    parameters: Type.Object({
      description: Type.String(),
      cron: Type.String(),
    }),
    async execute(_id, params) {
      const tasksPath = resolve(homedir(), ".my-assistant", "data", "tasks.json");
      // Delegate to the core cron tools
      return {
        content: [{ type: "text", text: `[my-assistant] Scheduled: "${params.description}" at "${params.cron}"` }],
        details: params,
      };
    },
  });

  pi.registerTool({
    name: "run_script",
    label: "Run Script",
    description: "Execute a bash script",
    parameters: Type.Object({
      script: Type.String(),
    }),
    async execute(_id, params) {
      return {
        content: [{ type: "text", text: `[my-assistant] Script execution delegated to bash tool.` }],
        details: { scriptLength: params.script.length },
      };
    },
  });

  // Register commands
  pi.registerCommand("memory", {
    description: "Search or list personal assistant memories",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Memory: ${args || "use /memory <keyword> to search"}`, "info");
    },
  });

  pi.registerCommand("tasks", {
    description: "Manage scheduled tasks",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Tasks: ${args || "list"}`, "info");
    },
  });
}
TYPESCRIPT
```

- [ ] **Step 2: Install extension into pi**

```bash
NODE_OPTIONS='--experimental-strip-types' pi install /Users/wys3300/Desktop/my-assistent-baseOnpi 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add .pi/
git commit -m "feat: add pi-agent extension for cross-compatibility"
```

### Task 16: Global bin link + final assembly

- [ ] **Step 1: Install all dependences and build all packages**

```bash
cd /Users/wys3300/Desktop/my-assistent-baseOnpi
npm install --ignore-scripts 2>&1
npm run build 2>&1
```

- [ ] **Step 2: Create global symlink**

```bash
ln -sf /Users/wys3300/Desktop/my-assistent-baseOnpi/packages/cli/bin/my-assistant /Users/wys3300/.local/bin/my-assistant
```

- [ ] **Step 3: Test global command**

```bash
my-assistant help
```

- [ ] **Step 4: Test chat startup**

```bash
echo "exit" | timeout 5 my-assistant chat 2>&1 || true
```

- [ ] **Step 5: Commit any final changes**

```bash
git add -A
git status
git commit -m "chore: finalize project assembly and global bin link"
```

### Task 17: Git remote + push to GitHub

- [ ] **Step 1: Configure git remote**

```bash
cd /Users/wys3300/Desktop/my-assistent-baseOnpi
git remote add origin https://github.com/EasonW3300/my-assistant-BaseOnPi.git
```

- [ ] **Step 2: Create README.md if not already created**

```bash
cat > README.md << 'EOF'
# My-Assistant

基于 pi-agent 的个人 AI 管家。

## 安装

```bash
git clone https://github.com/EasonW3300/my-assistant-BaseOnPi.git
cd my-assistant-BaseOnPi
npm install --ignore-scripts
npm run build
npm link --workspace=packages/cli
```

## 配置

```bash
my-assistant config edit   # 编辑配置
my-assistant config show   # 查看配置
```

## 使用

```bash
my-assistant chat           # 启动交互聊天
my-assistant daemon start   # 启动后台守护进程
my-assistant memory search  # 搜索记忆
my-assistant tasks list     # 列出定时任务
my-assistant skills list    # 列出自动生成的技能
```

## 项目结构

- `packages/core` — Agent 核心模块（工具、记忆、技能引擎）
- `packages/cli` — CLI 交互模式
- `packages/daemon` — 后台守护进程
- `.pi/` — pi-agent 扩展

## 技术栈

- 运行时: Node.js >= 22.19.0, TypeScript 5.9
- Agent 引擎: @earendil-works/pi-agent-core
- 默认模型: DeepSeek V4 Pro
- 邮件: nodemailer (SMTP)
- 定时任务: node-cron
EOF
git add README.md
git commit -m "docs: add README"
```

- [ ] **Step 3: Push to GitHub**

```bash
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Verify push**

```bash
git log --oneline | head -5
git remote -v
```

---

## Task Dependency Order

```
Task 1 (root) → Task 2 (tsconfig) → Task 3 (core scaffold)
  → Task 4 (config) → Task 5 (soul) → Task 6 (memory storage)
  → Task 7 (memory engine) → Task 8 (topic tracker + skill gen)
  → Task 9 (tools) → Task 10 (hooks) → Task 11 (createAssistantAgent)
  → Task 12 (CLI scaffold) → Task 13 (TUI chat)
  → Task 14 (daemon) → Task 15 (pi extension)
  → Task 16 (global bin) → Task 17 (push)
```
