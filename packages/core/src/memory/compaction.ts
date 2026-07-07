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
      e.type !== "task" // 待办任务不压缩
  );
}

export async function compactWithLLM(
  entries: MemoryEntry[],
  generateSummary: (
    entries: MemoryEntry[],
    type: string
  ) => Promise<string>
): Promise<{
  summary: string;
  removedIds: string[];
  sourceCount: number;
}> {
  if (entries.length === 0) {
    return { summary: "", removedIds: [], sourceCount: 0 };
  }

  // Group by type
  const byType = new Map<string, MemoryEntry[]>();
  for (const e of entries) {
    const list = byType.get(e.type) || [];
    list.push(e);
    byType.set(e.type, list);
  }

  // Generate summary per type
  const summaries: string[] = [];
  for (const [type, typeEntries] of byType) {
    const s = await generateSummary(typeEntries, type);
    if (s) summaries.push(s);
  }

  return {
    summary: summaries.join("\n"),
    removedIds: entries.map((e) => e.id),
    sourceCount: entries.length,
  };
}

export function applyCompaction(
  engine: MemoryEngine,
  result: {
    summary: string;
    removedIds: string[];
    sourceCount: number;
  }
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
