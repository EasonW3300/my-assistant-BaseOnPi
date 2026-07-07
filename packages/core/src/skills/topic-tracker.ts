import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.js";

interface TopicEntry {
  count: number;
  firstSeen: string;
  lastSeen: string;
  category: string;
  skillGenerated: boolean;
  skillName: string | null;
}

interface TopicStats {
  topics: Record<string, TopicEntry>;
}

const TOPIC_PATH = resolve(DATA_DIR, "topic-stats.json");
const TRIGGER_THRESHOLD = 3;
const SIMILARITY_THRESHOLD = 0.45;

function topicSimilarity(a: string, b: string): number {
  // Character-level Jaccard similarity (ignoring spaces)
  const charsA = [...a].filter((c) => c !== " ");
  const charsB = [...b].filter((c) => c !== " ");
  const setA = new Set(charsA);
  const setB = new Set(charsB);
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
    const dir = resolve(TOPIC_PATH, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(TOPIC_PATH, JSON.stringify(this.stats, null, 2), "utf-8");
  }

  track(
    topic: string,
    category: string
  ): { count: number; shouldGenerate: boolean } {
    // Find best matching existing topic
    let bestMatch: string | null = null;
    for (const existing of Object.keys(this.stats.topics)) {
      if (topicSimilarity(existing, topic) > SIMILARITY_THRESHOLD) {
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
      if (topicSimilarity(existing, topic) > SIMILARITY_THRESHOLD) {
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

  getAllTopics(): Record<string, TopicEntry> {
    return { ...this.stats.topics };
  }
}
