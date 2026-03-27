import { readFileSync, existsSync } from "node:fs";

async function cmdHealth(args, ctx) {
  if (args.length > 0) {
    console.error("Usage: health");
    process.exit(1);
  }
  const data = await ctx.api("GET", "/api/health");
  ctx.printJson(data);
}

async function cmdStats(args, ctx) {
  if (args.length > 0) {
    console.error("Usage: stats");
    process.exit(1);
  }
  const data = await ctx.api("GET", "/api/stats");
  ctx.printJson(data);
}

async function cmdHintTypes(args, ctx) {
  if (args.length > 0) {
    console.error("Usage: hint-types");
    process.exit(1);
  }
  const data = await ctx.api("GET", "/api/hint-types");
  ctx.printJson(data);
}

async function cmdRegions(args, ctx) {
  const params = new URLSearchParams();
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--country":
        params.set("country_code", args[++i]);
        break;
      case "--level":
        params.set("region_level", args[++i]);
        break;
      case "--search":
        params.set("search", args[++i]);
        break;
      case "--limit":
        params.set("limit", args[++i]);
        break;
      case "--offset":
        params.set("offset", args[++i]);
        break;
      case "--parent":
        params.set("parent_id", args[++i]);
        break;
      default:
        console.error(
          "Usage: regions [--country XX] [--level L] [--search Q] [--limit N] [--offset N] [--parent ID]"
        );
        process.exit(1);
    }
  }
  const qs = params.toString();
  const data = await ctx.api("GET", `/api/regions${qs ? "?" + qs : ""}`);
  ctx.printJson(data);
}

async function cmdRegion(args, ctx) {
  const id = args[0];
  if (!id || args.length > 1) {
    console.error("Usage: region <id>");
    process.exit(1);
  }
  const data = await ctx.api("GET", `/api/regions/${id}`);
  ctx.printJson(data);
}

async function cmdCreateHint(args, ctx) {
  const jsonStr = args[0];
  if (!jsonStr || args.length > 1) {
    console.error("Usage: create-hint '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await ctx.api("POST", "/api/hints", payload);
  ctx.printJson(data);
}

async function cmdUpdateHint(args, ctx) {
  const id = args[0];
  const jsonStr = args[1];
  if (!id || !jsonStr || args.length > 2) {
    console.error("Usage: update-hint <id> '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await ctx.api("PUT", `/api/hints/${encodeURIComponent(id)}`, payload);
  ctx.printJson(data);
}

async function cmdBatchHints(args, ctx) {
  const source = args[0];
  if (args.length > 1) {
    console.error("Usage: batch-hints <json-file-or-stdin>");
    process.exit(1);
  }

  let payload;
  if (source && existsSync(source)) {
    payload = JSON.parse(readFileSync(source, "utf-8"));
  } else if (source) {
    payload = JSON.parse(source);
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  }
  const data = await ctx.api("POST", "/api/hints/batch", payload);
  ctx.printJson(data);
}

async function cmdByCountry(args, ctx) {
  const jsonStr = args[0];
  if (!jsonStr || args.length > 1) {
    console.error("Usage: by-country '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await ctx.api("POST", "/api/hints/by-country", payload);
  ctx.printJson(data);
}

export const basicCommands = [
  {
    name: "health",
    usage: "health",
    description: "Check API connectivity",
    run: cmdHealth,
  },
  {
    name: "stats",
    usage: "stats",
    description: "Database statistics",
    run: cmdStats,
  },
  {
    name: "hint-types",
    usage: "hint-types",
    description: "List hint types with schemas",
    run: cmdHintTypes,
  },
  {
    name: "regions",
    usage: "regions [--country XX] [--level L] [--search Q] [--limit N]",
    description: "List regions",
    run: cmdRegions,
  },
  {
    name: "region",
    usage: "region <id>",
    description: "Region details with hints",
    run: cmdRegion,
  },
  {
    name: "create-hint",
    usage: "create-hint '<json>'",
    description: "Create one hint",
    run: cmdCreateHint,
  },
  {
    name: "update-hint",
    usage: "update-hint <id> '<json>'",
    description: "Update one hint",
    run: cmdUpdateHint,
  },
  {
    name: "batch-hints",
    usage: "batch-hints <file.json>",
    description: "Batch create (up to 10k)",
    run: cmdBatchHints,
  },
  {
    name: "by-country",
    usage: "by-country '<json>'",
    description: "Hint for all regions of country/level",
    run: cmdByCountry,
  },
];

export const commands = basicCommands;
