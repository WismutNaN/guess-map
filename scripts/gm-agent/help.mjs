export function renderHelp(commands) {
  const maxUsage = Math.max(...commands.map((c) => c.usage.length), 10);
  const lines = [
    "GuessMap Agent CLI",
    "",
    "Commands:",
  ];

  for (const cmd of commands) {
    lines.push(`  ${cmd.usage.padEnd(maxUsage)}  ${cmd.description}`);
  }

  lines.push("");
  lines.push("Environment:");
  lines.push("  GM_API_TOKEN  Bearer token (required)");
  lines.push("  GM_API_PORT   Port (default: 21345)");
  lines.push("  GM_API_HOST   Host (default: 127.0.0.1)");

  return lines.join("\n");
}

