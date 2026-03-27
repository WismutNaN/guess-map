import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function isCommandEntry(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    typeof value.usage === "string" &&
    typeof value.description === "string" &&
    typeof value.run === "function"
  );
}

async function loadCommands() {
  const here = dirname(fileURLToPath(import.meta.url));
  const commandsDir = join(here, "commands");
  const files = readdirSync(commandsDir)
    .filter((name) => name.endsWith(".mjs"))
    .filter((name) => !name.startsWith("_"))
    .sort();

  const merged = [];
  for (const file of files) {
    const url = pathToFileURL(join(commandsDir, file)).href;
    const mod = await import(url);
    const entries = mod.commands;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isCommandEntry(entry)) {
        throw new Error(`Invalid command export in ${file}`);
      }
      merged.push(entry);
    }
  }

  const seen = new Set();
  for (const cmd of merged) {
    if (seen.has(cmd.name)) {
      throw new Error(`Duplicate command name: ${cmd.name}`);
    }
    seen.add(cmd.name);
  }
  return merged;
}

export const commandRegistry = await loadCommands();
export const commandMap = new Map(commandRegistry.map((cmd) => [cmd.name, cmd]));

