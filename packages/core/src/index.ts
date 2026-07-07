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

export interface CreateAssistantOptions {
  mode?: "tui" | "headless";
  cwd?: string;
}

export async function createAssistantAgent(
  _config: AssistantConfig,
  _options?: CreateAssistantOptions
): Promise<any> {
  throw new Error("Not implemented yet — core modules pending");
}
