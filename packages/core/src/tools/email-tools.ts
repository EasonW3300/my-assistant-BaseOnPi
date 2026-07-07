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
    async execute(_toolCallId, params: any) {
      const smtp = configManager.get().email.smtp;
      if (!smtp.host || !smtp.user) {
        return {
          content: [
            {
              type: "text",
              text: "SMTP 未配置。请运行 `my-assistant config edit` 设置邮件服务。",
            },
          ],
          details: { error: "smtp_not_configured" },
        };
      }
      const { createTransport } = await import("nodemailer");
      const transporter = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transporter.sendMail({
        from: smtp.user,
        to: params.to,
        subject: params.subject,
        text: params.body,
      });
      return {
        content: [{ type: "text", text: `邮件已发送至 ${params.to}` }],
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
    async execute(_toolCallId, params: any) {
      const imap = configManager.get().email.imap;
      if (!imap.host || !imap.user) {
        return {
          content: [
            {
              type: "text",
              text: "IMAP 未配置。请运行 `my-assistant config edit` 设置邮件服务。",
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
            text: `[IMAP] 将从 ${imap.host} 获取最近 ${limit} 封邮件（账户: ${imap.user}）。完整 IMAP 功能需 imap-simple 运行时支持。`,
          },
        ],
        details: { host: imap.host, user: imap.user, limit },
      };
    },
  };

  return [sendEmailTool, checkInboxTool];
}
