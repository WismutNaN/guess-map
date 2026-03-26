#!/usr/bin/env node
/**
 * gm-agent — CLI tool for Claude Code to interact with GuessMap Agent API.
 *
 * Requires: Node.js 18+, GuessMap running with Agent API enabled.
 *
 * Environment:
 *   GM_API_TOKEN  — Bearer token (required)
 *   GM_API_PORT   — API port (default: 21345)
 *   GM_API_HOST   — API host (default: 127.0.0.1)
 *
 * Usage:
 *   node scripts/gm-agent.mjs <command> [options]
 *
 * Commands:
 *   health                              Check API connectivity
 *   stats                               Show database statistics
 *   hint-types                          List all hint types with schemas
 *   regions [--country XX] [--level L] [--search Q] [--limit N]
 *   region <id>                         Get region with its hints
 *   create-hint <json>                  Create a single hint
 *   batch-hints <json-file-or-stdin>    Batch create hints (up to 10k)
 *   by-country <json>                   Create hint for all regions of a country/level
 *   upload-asset <file> [--kind K] [--caption C]   Upload image file
 *   upload-asset-url <url> [--name N] [--kind K] [--caption C]  Download & upload image
 *   compile [code1,code2,...]           Recompile hint layers
 *   delete-hint <id>                    Delete a hint
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";

const HOST = process.env.GM_API_HOST || "127.0.0.1";
const PORT = process.env.GM_API_PORT || "21345";
const TOKEN = process.env.GM_API_TOKEN;
const BASE = `http://${HOST}:${PORT}`;

if (!TOKEN) {
  console.error(
    "Error: GM_API_TOKEN environment variable is required.\n" +
      "Get it from GuessMap Settings > Agent API > Token."
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers };
  if (body !== undefined) {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${JSON.stringify(data, null, 2)}`);
    process.exit(1);
  }
  return data;
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

// --- Commands ---

async function cmdHealth() {
  const data = await api("GET", "/api/health");
  printJson(data);
}

async function cmdStats() {
  const data = await api("GET", "/api/stats");
  printJson(data);
}

async function cmdHintTypes() {
  const data = await api("GET", "/api/hint-types");
  printJson(data);
}

async function cmdRegions(args) {
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
    }
  }
  const qs = params.toString();
  const data = await api("GET", `/api/regions${qs ? "?" + qs : ""}`);
  printJson(data);
}

async function cmdRegion(id) {
  if (!id) {
    console.error("Usage: region <id>");
    process.exit(1);
  }
  const data = await api("GET", `/api/regions/${id}`);
  printJson(data);
}

async function cmdCreateHint(jsonStr) {
  if (!jsonStr) {
    console.error("Usage: create-hint '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await api("POST", "/api/hints", payload);
  printJson(data);
}

async function cmdBatchHints(source) {
  let payload;
  if (source && existsSync(source)) {
    payload = JSON.parse(readFileSync(source, "utf-8"));
  } else if (source) {
    payload = JSON.parse(source);
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  }
  const data = await api("POST", "/api/hints/batch", payload);
  printJson(data);
}

async function cmdByCountry(jsonStr) {
  if (!jsonStr) {
    console.error("Usage: by-country '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await api("POST", "/api/hints/by-country", payload);
  printJson(data);
}

async function cmdUploadAsset(filePath, args) {
  if (!filePath || !existsSync(filePath)) {
    console.error(`Usage: upload-asset <file> [--kind K] [--caption C]`);
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let kind = "sample";
  let caption = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--kind") kind = args[++i];
    if (args[i] === "--caption") caption = args[++i];
  }

  const bytes = readFileSync(filePath);
  const data64 = bytes.toString("base64");
  const fileName = basename(filePath);

  const payload = { file_name: fileName, data: data64, kind, caption };
  const result = await api("POST", "/api/assets", payload);
  printJson(result);
}

async function cmdUploadAssetUrl(url, args) {
  if (!url) {
    console.error(
      "Usage: upload-asset-url <url> [--name N] [--kind K] [--caption C]"
    );
    process.exit(1);
  }

  let kind = "sample";
  let caption = null;
  let name = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--kind") kind = args[++i];
    if (args[i] === "--caption") caption = args[++i];
    if (args[i] === "--name") name = args[++i];
  }

  // Download the image
  console.error(`Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to download: HTTP ${res.status}`);
    process.exit(1);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const data64 = buffer.toString("base64");

  // Determine filename
  if (!name) {
    const urlPath = new URL(url).pathname;
    name = basename(urlPath) || "image.png";
    // Ensure it has an extension
    if (!extname(name)) {
      const ct = res.headers.get("content-type") || "";
      const extMap = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
      };
      name += extMap[ct] || ".png";
    }
  }

  console.error(`Uploading as: ${name} (${buffer.length} bytes)`);
  const payload = { file_name: name, data: data64, kind, caption };
  const result = await api("POST", "/api/assets", payload);
  printJson(result);
}

async function cmdCompile(codes) {
  const payload = {};
  if (codes) {
    payload.hint_type_codes = codes.split(",").map((c) => c.trim());
  }
  const data = await api("POST", "/api/layers/compile", payload);
  printJson(data);
}

async function cmdDeleteHint(id) {
  if (!id) {
    console.error("Usage: delete-hint <id>");
    process.exit(1);
  }
  await api("DELETE", `/api/hints/${id}`);
  console.log(`Deleted hint ${id}`);
}

// --- Main ---

const [, , command, ...args] = process.argv;

switch (command) {
  case "health":
    await cmdHealth();
    break;
  case "stats":
    await cmdStats();
    break;
  case "hint-types":
    await cmdHintTypes();
    break;
  case "regions":
    await cmdRegions(args);
    break;
  case "region":
    await cmdRegion(args[0]);
    break;
  case "create-hint":
    await cmdCreateHint(args[0]);
    break;
  case "batch-hints":
    await cmdBatchHints(args[0]);
    break;
  case "by-country":
    await cmdByCountry(args[0]);
    break;
  case "upload-asset":
    await cmdUploadAsset(args[0], args.slice(1));
    break;
  case "upload-asset-url":
    await cmdUploadAssetUrl(args[0], args.slice(1));
    break;
  case "compile":
    await cmdCompile(args[0]);
    break;
  case "delete-hint":
    await cmdDeleteHint(args[0]);
    break;
  default:
    console.error(`GuessMap Agent CLI

Commands:
  health                                Check API connectivity
  stats                                 Database statistics
  hint-types                            List hint types with schemas
  regions [--country XX] [--level L] [--search Q] [--limit N]
  region <id>                           Region details with hints
  create-hint '<json>'                  Create one hint
  batch-hints <file.json>               Batch create (up to 10k)
  by-country '<json>'                   Hint for all regions of country/level
  upload-asset <file> [--kind K] [--caption C]
  upload-asset-url <url> [--name N] [--kind K] [--caption C]
  compile [code1,code2,...]             Recompile layers
  delete-hint <id>                      Delete a hint

Environment:
  GM_API_TOKEN  Bearer token (required)
  GM_API_PORT   Port (default: 21345)
`);
    process.exit(command ? 1 : 0);
}
