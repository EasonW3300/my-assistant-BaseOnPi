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
    personality:
      "温和、细心、善于记住用户的偏好和习惯，回复简洁有力，用中文",
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

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class ConfigManager {
  private config: AssistantConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AssistantConfig {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(
        CONFIG_PATH,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
        "utf-8"
      );
      return deepClone(DEFAULT_CONFIG);
    }
    try {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return { ...deepClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
    } catch {
      return deepClone(DEFAULT_CONFIG);
    }
  }

  save(): void {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
  }

  get(): AssistantConfig {
    return deepClone(this.config);
  }

  updateAssistant(name: string, personality: string): void {
    this.config.assistant = { name, personality, customized: true };
    this.save();
  }

  updateEmail(
    smtp: AssistantConfig["email"]["smtp"],
    imap: AssistantConfig["email"]["imap"]
  ): void {
    this.config.email = { smtp, imap };
    this.save();
  }

  isFirstRun(): boolean {
    return !this.config.assistant.customized;
  }

  reset(): void {
    this.config = deepClone(DEFAULT_CONFIG);
    this.save();
  }

  ensureDataDir(): void {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}
