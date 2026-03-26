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
 *   update-hint <id> <json>             Update a single hint
 *   batch-hints <json-file-or-stdin>    Batch create hints (up to 10k)
 *   by-country <json>                   Create hint for all regions of a country/level
 *   fill-flags-svg [--country XX] [--force] [--no-compile]
 *                                        Upload SVG flags and upsert country flag hints
 *   fill-country-domains [--country XX] [--force] [--no-compile]
 *                                        Upsert country_domain hints (.ru, .uk, ...)
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
const FLAG_ICONS_VERSION = "7.5.0";
const FLAG_ICONS_BASE = `https://cdn.jsdelivr.net/gh/lipis/flag-icons@${FLAG_ICONS_VERSION}/flags/4x3`;
const COUNTRY_DOMAIN_HINT_TYPE = "country_domain";
const COUNTRY_DOMAIN_SOURCE = "seed:country_tld";
const COUNTRY_TLD_OVERRIDES = {
  GB: "uk",
};

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

async function api(method, path, body, { fatal = true } = {}) {
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
    if (fatal) {
      console.error(`HTTP ${res.status}: ${JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function countryCodeToFlagEmoji(code) {
  if (!/^[A-Za-z]{2}$/.test(code || "")) return null;
  return [...code.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join("");
}

function countryCodeToDomain(code) {
  if (!/^[A-Za-z]{2}$/.test(code || "")) return null;
  const upper = code.toUpperCase();
  const suffix = COUNTRY_TLD_OVERRIDES[upper] || upper.toLowerCase();
  return `.${suffix}`;
}

async function ensureHintTypeExists(code) {
  const resp = await api("GET", "/api/hint-types");
  const items = Array.isArray(resp?.items) ? resp.items : [];
  const exists = items.some((item) => item?.code === code && item?.is_active !== false);
  if (exists) return;

  console.error(`Hint type '${code}' not found in the current database.`);
  console.error("Restart GuessMap after updating backend seed data, then retry.");
  process.exit(1);
}

async function uploadAssetFromUrl(
  url,
  { name = null, kind = "sample", caption = null, fatal = true } = {}
) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const data64 = buffer.toString("base64");

  let finalName = name;
  if (!finalName) {
    const urlPath = new URL(url).pathname;
    finalName = basename(urlPath) || "image.png";
    if (!extname(finalName)) {
      const ct = res.headers.get("content-type") || "";
      const extMap = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
      };
      finalName += extMap[ct] || ".png";
    }
  }

  const payload = { file_name: finalName, data: data64, kind, caption };
  return api("POST", "/api/assets", payload, { fatal });
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

async function cmdUpdateHint(id, jsonStr) {
  if (!id || !jsonStr) {
    console.error("Usage: update-hint <id> '<json>'");
    process.exit(1);
  }
  const payload = JSON.parse(jsonStr);
  const data = await api("PUT", `/api/hints/${encodeURIComponent(id)}`, payload);
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

  try {
    console.error(`Downloading: ${url}`);
    const result = await uploadAssetFromUrl(url, { name, kind, caption });
    printJson(result);
  } catch (error) {
    console.error(String(error));
    process.exit(1);
  }
}

async function cmdFillFlagsSvg(args) {
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-flags-svg [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  const params = new URLSearchParams({
    region_level: "country",
    limit: "2000",
  });
  if (countryFilter) params.set("country_code", countryFilter);

  const regionResp = await api("GET", `/api/regions?${params.toString()}`);
  const countries = Array.isArray(regionResp.items) ? regionResp.items : [];
  if (countries.length === 0) {
    console.error("No countries found for the requested filter.");
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let uploaded = 0;

  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const code = String(country.country_code || "").toUpperCase();
    const name = country.name || country.name_en || country.id;

    if (!/^[A-Z]{2}$/.test(code)) {
      skipped++;
      console.error(`[${i + 1}/${countries.length}] skip ${name}: invalid code '${code}'`);
      continue;
    }

    const regionId = encodeURIComponent(country.id);
    const region = await api("GET", `/api/regions/${regionId}`);
    const hints = Array.isArray(region.hints) ? region.hints : [];
    const flagHints = hints.filter((h) => h.hint_type_code === "flag");
    const preferred =
      flagHints.find((h) => h.icon_asset_id && String(h.icon_asset_id).trim().length > 0) ||
      flagHints[0] ||
      null;

    if (!force && preferred?.icon_asset_id) {
      skipped++;
      console.error(`[${i + 1}/${countries.length}] skip ${code}: already has icon_asset_id`);
      continue;
    }

    const codeLower = code.toLowerCase();
    const svgUrl = `${FLAG_ICONS_BASE}/${codeLower}.svg`;

    try {
      const asset = await uploadAssetFromUrl(svgUrl, {
        name: `${codeLower}.svg`,
        kind: "flag",
        caption: `${name} (${code})`,
        fatal: false,
      });
      uploaded++;

      const emoji = countryCodeToFlagEmoji(code) || code;
      const sourceNote = `flag-icons@${FLAG_ICONS_VERSION} ${svgUrl}`;

      if (preferred) {
        await api(
          "PUT",
          `/api/hints/${encodeURIComponent(preferred.id)}`,
          {
            region_id: preferred.region_id || country.id,
            hint_type_code: "flag",
            short_value: preferred.short_value ?? emoji,
            full_value: preferred.full_value ?? name,
            data_json: preferred.data_json ?? null,
            color: preferred.color ?? null,
            confidence: preferred.confidence ?? 1.0,
            min_zoom: preferred.min_zoom ?? 2.0,
            max_zoom: preferred.max_zoom ?? 8.0,
            is_visible: preferred.is_visible ?? true,
            image_asset_id: preferred.image_asset_id ?? null,
            icon_asset_id: asset.id,
            source_note: preferred.source_note ?? sourceNote,
          },
          { fatal: false }
        );
        updated++;
        console.error(`[${i + 1}/${countries.length}] updated ${code} -> asset ${asset.id}`);
      } else {
        await api(
          "POST",
          "/api/hints",
          {
            region_id: country.id,
            hint_type_code: "flag",
            short_value: emoji,
            full_value: name,
            confidence: 1.0,
            min_zoom: 2.0,
            max_zoom: 8.0,
            is_visible: true,
            icon_asset_id: asset.id,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        created++;
        console.error(`[${i + 1}/${countries.length}] created ${code} -> asset ${asset.id}`);
      }
    } catch (error) {
      failed++;
      console.error(
        `[${i + 1}/${countries.length}] failed ${code} (${name}): ${String(error)}`
      );
    }
  }

  if (!noCompile && (created > 0 || updated > 0)) {
    await api("POST", "/api/layers/compile", { hint_type_codes: ["flag"] });
  }

  printJson({
    source: `flag-icons@${FLAG_ICONS_VERSION}`,
    countries_total: countries.length,
    uploaded,
    created,
    updated,
    skipped,
    failed,
    compiled: !noCompile && (created > 0 || updated > 0),
  });
}

async function cmdFillCountryDomains(args) {
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-country-domains [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(COUNTRY_DOMAIN_HINT_TYPE);

  const params = new URLSearchParams({
    region_level: "country",
    limit: "2000",
  });
  if (countryFilter) params.set("country_code", countryFilter);

  const regionResp = await api("GET", `/api/regions?${params.toString()}`);
  const countries = Array.isArray(regionResp.items) ? regionResp.items : [];
  if (countries.length === 0) {
    console.error("No countries found for the requested filter.");
    return;
  }

  let created = 0;
  let updated = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const code = String(country.country_code || "").toUpperCase();
    const name = country.name || country.name_en || country.id;

    if (!/^[A-Z]{2}$/.test(code)) {
      skipped++;
      console.error(`[${i + 1}/${countries.length}] skip ${name}: invalid code '${code}'`);
      continue;
    }

    const tld = countryCodeToDomain(code);
    if (!tld) {
      skipped++;
      console.error(`[${i + 1}/${countries.length}] skip ${name}: cannot derive ccTLD`);
      continue;
    }

    const regionId = encodeURIComponent(country.id);
    const region = await api("GET", `/api/regions/${regionId}`);
    const hints = Array.isArray(region.hints) ? region.hints : [];
    const domainHints = hints.filter((h) => h.hint_type_code === COUNTRY_DOMAIN_HINT_TYPE);
    const legacyDomainNotes = hints.filter(
      (h) =>
        h.hint_type_code === "note" &&
        typeof h.source_note === "string" &&
        h.source_note.startsWith(COUNTRY_DOMAIN_SOURCE)
    );
    const preferred =
      domainHints.find(
        (h) =>
          typeof h.source_note === "string" &&
          h.source_note.startsWith(COUNTRY_DOMAIN_SOURCE)
      ) ||
      domainHints[0] ||
      legacyDomainNotes[0] ||
      null;
    const needsTypeMigration =
      preferred && preferred.hint_type_code !== COUNTRY_DOMAIN_HINT_TYPE;
    const sourceNote = `${COUNTRY_DOMAIN_SOURCE} ${code} ${tld}`;
    const existingData =
      preferred && preferred.data_json && typeof preferred.data_json === "object"
        ? preferred.data_json
        : {};
    const dataJson = {
      ...existingData,
      tld,
      country_code: code,
    };

    if (
      !force &&
      !needsTypeMigration &&
      preferred?.short_value &&
      String(preferred.short_value).trim().length > 0
    ) {
      skipped++;
      console.error(`[${i + 1}/${countries.length}] skip ${code}: already has domain hint`);
      continue;
    }

    try {
      if (preferred) {
        await api(
          "PUT",
          `/api/hints/${encodeURIComponent(preferred.id)}`,
          {
            region_id: preferred.region_id || country.id,
            hint_type_code: COUNTRY_DOMAIN_HINT_TYPE,
            short_value: tld,
            full_value: `Country domain for ${name}`,
            data_json: dataJson,
            color: preferred.color ?? null,
            confidence: preferred.confidence ?? 1.0,
            min_zoom: preferred.min_zoom ?? 2.0,
            max_zoom: preferred.max_zoom ?? 8.0,
            is_visible: preferred.is_visible ?? true,
            image_asset_id: preferred.image_asset_id ?? null,
            icon_asset_id: preferred.icon_asset_id ?? null,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        if (needsTypeMigration) {
          migrated++;
          console.error(`[${i + 1}/${countries.length}] migrated ${code}: note -> ${COUNTRY_DOMAIN_HINT_TYPE} (${tld})`);
        } else {
          updated++;
          console.error(`[${i + 1}/${countries.length}] updated ${code}: ${tld}`);
        }
      } else {
        await api(
          "POST",
          "/api/hints",
          {
            region_id: country.id,
            hint_type_code: COUNTRY_DOMAIN_HINT_TYPE,
            short_value: tld,
            full_value: `Country domain for ${name}`,
            data_json: dataJson,
            confidence: 1.0,
            min_zoom: 2.0,
            max_zoom: 8.0,
            is_visible: true,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        created++;
        console.error(`[${i + 1}/${countries.length}] created ${code}: ${tld}`);
      }
    } catch (error) {
      failed++;
      console.error(
        `[${i + 1}/${countries.length}] failed ${code} (${name}): ${String(error)}`
      );
    }
  }

  if (!noCompile && (created > 0 || updated > 0 || migrated > 0)) {
    await api("POST", "/api/layers/compile", {
      hint_type_codes: [COUNTRY_DOMAIN_HINT_TYPE],
    });
  }

  printJson({
    hint_type_code: COUNTRY_DOMAIN_HINT_TYPE,
    source: COUNTRY_DOMAIN_SOURCE,
    countries_total: countries.length,
    created,
    updated,
    migrated,
    skipped,
    failed,
    compiled: !noCompile && (created > 0 || updated > 0 || migrated > 0),
  });
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
  case "update-hint":
    await cmdUpdateHint(args[0], args[1]);
    break;
  case "batch-hints":
    await cmdBatchHints(args[0]);
    break;
  case "by-country":
    await cmdByCountry(args[0]);
    break;
  case "fill-flags-svg":
    await cmdFillFlagsSvg(args);
    break;
  case "fill-country-domains":
    await cmdFillCountryDomains(args);
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
  update-hint <id> '<json>'             Update one hint
  batch-hints <file.json>               Batch create (up to 10k)
  by-country '<json>'                   Hint for all regions of country/level
  fill-flags-svg [--country XX] [--force] [--no-compile]
                                        Upload SVG flags + upsert country hints
  fill-country-domains [--country XX] [--force] [--no-compile]
                                        Upsert country_domain hints (.ru, .uk, ...)
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
