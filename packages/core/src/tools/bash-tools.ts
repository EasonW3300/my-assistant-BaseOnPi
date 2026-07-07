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
      "Execute a bash script. Use when tasks cannot be done with existing tools. Script runs in a temp file with set -euo pipefail.",
    parameters: Type.Object({
      script: Type.String({
        description: "The bash script content to execute",
      }),
      cwd: Type.Optional(
        Type.String({ description: "Working directory (default: current)" })
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in seconds (default: 60)" })
      ),
    }),
    async execute(_toolCallId, params: any) {
      const { spawn } = await import("cross-spawn");
      const scriptPath = resolve(
        tmpdir(),
        `my-assistant-${randomUUID()}.sh`
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
        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

        child.on("close", (code) => {
          try { unlinkSync(scriptPath); } catch {}
          resolveResult({
            content: [
              {
                type: "text",
                text: `Exit: ${code}\n\nSTDOUT:\n${stdout.slice(0, 5000)}${stderr ? `\n\nSTDERR:\n${stderr.slice(0, 2000)}` : ""}`,
              },
            ],
            details: { exitCode: code },
          });
        });

        child.on("error", (err) => {
          try { unlinkSync(scriptPath); } catch {}
          resolveResult({
            content: [
              { type: "text", text: `脚本执行失败: ${err.message}` },
            ],
            details: { error: err.message },
          });
        });
      });
    },
  };
}
