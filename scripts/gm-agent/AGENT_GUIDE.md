# gm-agent Agent Guide

## 1) Read minimum context

Start with these files only:

1. `scripts/gm-agent.mjs` - entrypoint
2. `scripts/gm-agent/registry.mjs` - auto-discovery of command modules
3. `scripts/gm-agent/core/context.mjs` - shared helpers (`api`, `uploadAssetFromUrl`, etc.)

Everything else is command modules.

## 2) Add a new command with minimal edits

1. Add one module in `scripts/gm-agent/commands/` (or reuse an existing one by domain).
2. Export `commands` with command metadata object(s): `{ name, usage, description, run }`.
3. Done. `registry.mjs` auto-loads `commands/*.mjs`.

No entrypoint or registry edits are needed unless bootstrapping changes.

## 3) Command shape

```js
async function cmdExample(args, ctx) {
  const data = await ctx.api("GET", "/api/stats");
  ctx.printJson(data);
}

export const exampleCommands = [
  {
    name: "example",
    usage: "example [--flag]",
    description: "Example command",
    run: cmdExample,
  },
];

export const commands = exampleCommands;
```

## 4) Where to copy integration patterns

- Basic CRUD / API calls: `scripts/gm-agent/commands/basic.mjs`
- Asset upload patterns: `scripts/gm-agent/commands/assets.mjs`
- Seed-style DB/API upserts (flags/domains/phones): `scripts/gm-agent/commands/fill-seed.mjs`
- Heavy web parsers + imports: `scripts/gm-agent/fill-hints.mjs`

## 5) Rules of thumb

- Keep one domain per module (basic, assets, seed imports, web imports).
- Keep command-specific constants in the same module as the command.
- Use context helpers (`ctx.api`, `ctx.ensureHintTypeExists`, `ctx.uploadAssetFromUrl`) instead of duplicating logic.
- Validate args in command handlers and print exact usage on invalid input.
