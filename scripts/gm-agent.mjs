#!/usr/bin/env node
/**
 * gm-agent entrypoint.
 *
 * Design goals:
 * - Thin bootstrap (small context footprint for agents)
 * - Command-per-module extensibility
 * - Central command registry with generated help
 */

import { createAgentContext } from "./gm-agent/core/context.mjs";
import { commandRegistry, commandMap } from "./gm-agent/registry.mjs";
import { renderHelp } from "./gm-agent/help.mjs";

const [, , command, ...args] = process.argv;
const ctx = createAgentContext(process.env);

if (!command) {
  console.error(renderHelp(commandRegistry));
  process.exit(0);
}

const entry = commandMap.get(command);
if (!entry) {
  console.error(renderHelp(commandRegistry));
  process.exit(1);
}

try {
  await entry.run(args, ctx);
} catch (error) {
  console.error(String(error));
  process.exit(1);
}

