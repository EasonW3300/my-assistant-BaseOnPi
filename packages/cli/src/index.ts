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
    console.error(`未知命令: ${args.join(" ")}`);
    printHelp();
    process.exit(1);
  }

  await command.run();
}

main().catch((err) => {
  console.error("错误:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
