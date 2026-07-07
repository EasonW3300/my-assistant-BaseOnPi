import type { AssistantConfig } from "@my-assistant/core";

export class MailWatcher {
  private config: AssistantConfig["email"];
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: AssistantConfig["email"]) {
    this.config = config;
  }

  start(
    onNewMail: (mail: {
      from: string;
      subject: string;
      body: string;
    }) => void
  ): void {
    if (!this.config.imap.host || !this.config.imap.user) {
      console.log("[mail-watcher] IMAP 未配置，跳过");
      return;
    }
    console.log(
      `[mail-watcher] 监听 ${this.config.imap.host}:${this.config.imap.port}`
    );
    console.log("[mail-watcher] 轮询模式（每60秒），完整 IMAP IDLE 需 imap-simple 运行时");

    this.intervalId = setInterval(() => {
      // Poll for new mail - full impl requires imap-simple
    }, 60000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[mail-watcher] 已停止");
  }
}
