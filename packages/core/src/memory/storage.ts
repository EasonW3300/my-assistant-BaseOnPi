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
