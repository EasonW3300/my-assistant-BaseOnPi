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
      Pick<
        MemoryEntry,
        "content" | "keywords" | "type" | "status" | "accessCount"
      >
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
    this.store.entries = this.store.entries.filter(
      (e) => !ids.includes(e.id)
    );
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
