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
 *   fill-phone-codes [--country XX] [--force] [--no-compile]
 *                                        Upsert phone_hint hints (+7, +44, +1 205, ...)
 *   fill-google-cars [--country XX] [--force] [--no-compile]
 *                                        Import Google Car hints from Geometas
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
const PHONE_HINT_TYPE = "phone_hint";
const PHONE_COUNTRY_SOURCE = "seed:phone_country";
const PHONE_ADMIN1_SOURCE = "seed:phone_admin1";
const PHONE_COUNTRY_DATA_PATH = "../assets/metadata/phone_country_codes.json";
const PHONE_ADMIN1_DATA_PATH = "../assets/metadata/phone_admin1_codes.json";
const COUNTRY_DOMAIN_HINT_TYPE = "country_domain";
const COUNTRY_DOMAIN_SOURCE = "seed:country_tld";
const COUNTRY_TLD_OVERRIDES = {
  GB: "uk",
};
const GOOGLE_CAR_HINT_TYPE = "camera_meta";
const GOOGLE_CAR_SOURCE = "geometas:google_car";
const GOOGLE_CAR_CATEGORY_URL = "https://www.geometas.com/metas/categories/google_car/";
const GOOGLE_CAR_DETAIL_BASE = "https://www.geometas.com";
const GOOGLE_CAR_DETAIL_COUNTRY_OVERRIDES = {
  "2bf0c6d3-214d-4a33-8e4d-bb7b712ddd64": "CW", // Curacao
  "664b0a30-c2f3-4cff-bb9a-ddd7fc4229ed": "CW", // Curacao
  "eda7e53a-1407-47b5-9a5a-ac4448ff3914": "FR", // Reunion (mapped to France)
};
const GOOGLE_CAR_COUNTRY_ALIASES = {
  "U.S. Virgin Islands": "United States Virgin Islands",
  "United Arab Emirates (UAE)": "United Arab Emirates",
  "Christmas Island": "AU",
  Curacao: "CW",
  Curaçao: "CW",
  Reunion: "FR",
  Réunion: "FR",
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

function readJsonAsset(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  if (!existsSync(url)) {
    throw new Error(`Data file not found: ${url.pathname}`);
  }

  const raw = readFileSync(url, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function normalizeRegionRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("admin1:")) return null;
  return `admin1:${trimmed.slice(7).toUpperCase()}`;
}

function decodeHtmlEntities(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeCountryLookup(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeGoogleCarCountry(rawCountry, detailId) {
  const decoded = decodeHtmlEntities(rawCountry).replace(/\s+/g, " ").trim();
  const withoutPrefix = decoded.replace(/^[^\p{L}\p{N}]+/u, "").trim();

  if (withoutPrefix && withoutPrefix !== "None") {
    return GOOGLE_CAR_COUNTRY_ALIASES[withoutPrefix] || withoutPrefix;
  }

  const fallback = GOOGLE_CAR_DETAIL_COUNTRY_OVERRIDES[detailId];
  return fallback || null;
}

function parseGoogleCarCategoryCards(html) {
  const cardRegex =
    /<a href="(\/metas\/detail\/[0-9a-f-]+\/)"\s*>\s*<img[^>]*src="([^"]+)"[\s\S]*?<div class="my-3 md:my-auto">\s*<a href="\1">([\s\S]*?)<\/a>[\s\S]*?<span class="bg-stone-300 text-stone-600 rounded-xl px-2 py-1 font-medium text-xs truncate">\s*([^<]*)<\/span>/gi;

  const cards = [];
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const detailPath = match[1];
    const detailId = detailPath
      .split("/")
      .filter(Boolean)
      .at(-1);
    if (!detailId) continue;

    const imageUrl = decodeHtmlEntities(match[2]).trim();
    const description = decodeHtmlEntities(match[3]).replace(/\s+/g, " ").trim();
    const country = normalizeGoogleCarCountry(match[4], detailId);
    if (!country || !imageUrl) continue;

    cards.push({
      detailId,
      sourceUrl: new URL(detailPath, GOOGLE_CAR_DETAIL_BASE).toString(),
      imageUrl,
      description,
      country,
    });
  }

  return cards;
}

function inferGoogleCarGeneration(description) {
  if (typeof description !== "string" || !description.trim()) return null;
  const match = description.match(/\b(?:gen(?:eration)?\s*)([1-4])\b/i);
  if (!match) return null;
  return `gen${match[1]}`;
}

function inferGoogleCarHasBlur(description) {
  if (typeof description !== "string" || !description.trim()) return null;
  return /\bblur(?:red|ring)?\b/i.test(description) ? true : null;
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

async function cmdFillPhoneCodes(args) {
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-phone-codes [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(PHONE_HINT_TYPE);

  let countryCatalog;
  let admin1Catalog;
  try {
    countryCatalog = readJsonAsset(PHONE_COUNTRY_DATA_PATH);
    admin1Catalog = readJsonAsset(PHONE_ADMIN1_DATA_PATH);
  } catch (error) {
    console.error(`Failed to load phone code datasets: ${String(error)}`);
    process.exit(1);
  }

  const countryItems = Array.isArray(countryCatalog?.items) ? countryCatalog.items : [];
  const admin1Items = Array.isArray(admin1Catalog?.items) ? admin1Catalog.items : [];

  const phoneByCountry = new Map();
  for (const item of countryItems) {
    const code = String(item?.country_code || "").toUpperCase();
    const prefix = String(item?.prefix || "").trim();
    const format = typeof item?.format === "string" ? item.format.trim() : null;
    if (!/^[A-Z]{2}$/.test(code) || !/^\+[0-9]+$/.test(prefix)) continue;
    phoneByCountry.set(code, {
      country_code: code,
      prefix,
      format: format && format.length > 0 ? format : null,
    });
  }

  const phoneByAdmin1 = new Map();
  for (const item of admin1Items) {
    const regionRef = normalizeRegionRef(item?.region_ref);
    const countryCode = String(item?.country_code || "").toUpperCase();
    const prefix = String(item?.prefix || "").trim();
    const format = typeof item?.format === "string" ? item.format.trim() : null;
    const areaCodes = Array.isArray(item?.area_codes)
      ? item.area_codes
          .map((x) => String(x).trim())
          .filter((x) => /^[0-9]{2,6}$/.test(x))
      : [];
    if (!regionRef || !/^[A-Z]{2}$/.test(countryCode) || !/^\+[0-9]+(?:\s+[0-9]{2,6})?$/.test(prefix)) {
      continue;
    }
    phoneByAdmin1.set(regionRef, {
      region_ref: regionRef,
      country_code: countryCode,
      prefix,
      format: format && format.length > 0 ? format : null,
      area_codes: areaCodes,
    });
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

  let countryCreated = 0;
  let countryUpdated = 0;
  let countrySkipped = 0;
  let countryFailed = 0;

  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    const code = String(country.country_code || "").toUpperCase();
    const name = country.name || country.name_en || country.id;

    if (!/^[A-Z]{2}$/.test(code)) {
      countrySkipped++;
      console.error(`[country ${i + 1}/${countries.length}] skip ${name}: invalid code '${code}'`);
      continue;
    }

    const phone = phoneByCountry.get(code);
    if (!phone) {
      countrySkipped++;
      console.error(`[country ${i + 1}/${countries.length}] skip ${code}: no phone dataset entry`);
      continue;
    }

    const regionId = encodeURIComponent(country.id);
    const hintsResp = await api("GET", `/api/regions/${regionId}/hints`);
    const hints = Array.isArray(hintsResp.items) ? hintsResp.items : [];
    const phoneHints = hints.filter((h) => h.hint_type_code === PHONE_HINT_TYPE);
    const seeded = phoneHints.find(
      (h) =>
        typeof h.source_note === "string" &&
        h.source_note.startsWith(PHONE_COUNTRY_SOURCE)
    );
    const sourceNote = `${PHONE_COUNTRY_SOURCE} ${code}`;
    const fullValue = phone.format
      ? `Country phone code ${phone.prefix}, format ${phone.format}`
      : `Country phone code ${phone.prefix}`;
    const dataJson = {
      prefix: phone.prefix,
      format: phone.format,
    };

    if (!force && seeded?.short_value && String(seeded.short_value).trim().length > 0) {
      countrySkipped++;
      console.error(`[country ${i + 1}/${countries.length}] skip ${code}: already seeded`);
      continue;
    }
    if (!force && !seeded && phoneHints.length > 0) {
      countrySkipped++;
      console.error(`[country ${i + 1}/${countries.length}] skip ${code}: has manual phone_hint`);
      continue;
    }

    try {
      if (seeded) {
        await api(
          "PUT",
          `/api/hints/${encodeURIComponent(seeded.id)}`,
          {
            region_id: seeded.region_id || country.id,
            hint_type_code: PHONE_HINT_TYPE,
            short_value: phone.prefix,
            full_value: fullValue,
            data_json: dataJson,
            color: seeded.color ?? null,
            confidence: seeded.confidence ?? 1.0,
            min_zoom: seeded.min_zoom ?? 2.0,
            max_zoom: seeded.max_zoom ?? 10.0,
            is_visible: seeded.is_visible ?? true,
            image_asset_id: seeded.image_asset_id ?? null,
            icon_asset_id: seeded.icon_asset_id ?? null,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        countryUpdated++;
        console.error(`[country ${i + 1}/${countries.length}] updated ${code}: ${phone.prefix}`);
      } else {
        await api(
          "POST",
          "/api/hints",
          {
            region_id: country.id,
            hint_type_code: PHONE_HINT_TYPE,
            short_value: phone.prefix,
            full_value: fullValue,
            data_json: dataJson,
            confidence: 1.0,
            min_zoom: 2.0,
            max_zoom: 10.0,
            is_visible: true,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        countryCreated++;
        console.error(`[country ${i + 1}/${countries.length}] created ${code}: ${phone.prefix}`);
      }
    } catch (error) {
      countryFailed++;
      console.error(
        `[country ${i + 1}/${countries.length}] failed ${code} (${name}): ${String(error)}`
      );
    }
  }

  const admin1CountrySet = new Set();
  for (const item of phoneByAdmin1.values()) {
    if (!countryFilter || item.country_code === countryFilter) {
      admin1CountrySet.add(item.country_code);
    }
  }
  const admin1Countries = Array.from(admin1CountrySet).sort();

  let admin1Created = 0;
  let admin1Updated = 0;
  let admin1Skipped = 0;
  let admin1Failed = 0;

  for (const cc of admin1Countries) {
    const admin1Resp = await api(
      "GET",
      `/api/regions?country_code=${encodeURIComponent(cc)}&region_level=admin1&limit=5000`
    );
    const regions = Array.isArray(admin1Resp.items) ? admin1Resp.items : [];

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const regionRef = normalizeRegionRef(region.geometry_ref);
      const override = regionRef ? phoneByAdmin1.get(regionRef) : null;
      if (!override) continue;

      const regionId = encodeURIComponent(region.id);
      const hintsResp = await api("GET", `/api/regions/${regionId}/hints`);
      const hints = Array.isArray(hintsResp.items) ? hintsResp.items : [];
      const phoneHints = hints.filter((h) => h.hint_type_code === PHONE_HINT_TYPE);
      const seeded = phoneHints.find(
        (h) =>
          typeof h.source_note === "string" &&
          h.source_note.startsWith(PHONE_ADMIN1_SOURCE)
      );
      const sourceNote = `${PHONE_ADMIN1_SOURCE} ${regionRef}`;
      const areaCodes = override.area_codes ?? [];
      const fullValue =
        areaCodes.length > 1
          ? `Regional codes: ${areaCodes.join(", ")}`
          : `Regional code: ${override.prefix}`;
      const dataJson = {
        prefix: override.prefix,
        format: override.format,
        area_codes: areaCodes,
      };

      if (!force && seeded?.short_value && String(seeded.short_value).trim().length > 0) {
        admin1Skipped++;
        continue;
      }
      if (!force && !seeded && phoneHints.length > 0) {
        admin1Skipped++;
        continue;
      }

      try {
        if (seeded) {
          await api(
            "PUT",
            `/api/hints/${encodeURIComponent(seeded.id)}`,
            {
              region_id: seeded.region_id || region.id,
              hint_type_code: PHONE_HINT_TYPE,
              short_value: override.prefix,
              full_value: fullValue,
              data_json: dataJson,
              color: seeded.color ?? null,
              confidence: seeded.confidence ?? 1.0,
              min_zoom: seeded.min_zoom ?? 3.0,
              max_zoom: seeded.max_zoom ?? 12.0,
              is_visible: seeded.is_visible ?? true,
              image_asset_id: seeded.image_asset_id ?? null,
              icon_asset_id: seeded.icon_asset_id ?? null,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          admin1Updated++;
        } else {
          await api(
            "POST",
            "/api/hints",
            {
              region_id: region.id,
              hint_type_code: PHONE_HINT_TYPE,
              short_value: override.prefix,
              full_value: fullValue,
              data_json: dataJson,
              confidence: 1.0,
              min_zoom: 3.0,
              max_zoom: 12.0,
              is_visible: true,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          admin1Created++;
        }
      } catch (error) {
        admin1Failed++;
        console.error(
          `[admin1 ${cc}] failed ${region.id} (${region.name}): ${String(error)}`
        );
      }
    }
  }

  const anyChanged =
    countryCreated > 0 || countryUpdated > 0 || admin1Created > 0 || admin1Updated > 0;
  if (!noCompile && anyChanged) {
    await api("POST", "/api/layers/compile", { hint_type_codes: [PHONE_HINT_TYPE] });
  }

  printJson({
    hint_type_code: PHONE_HINT_TYPE,
    source_country: PHONE_COUNTRY_SOURCE,
    source_admin1: PHONE_ADMIN1_SOURCE,
    countries_total: countries.length,
    country_created: countryCreated,
    country_updated: countryUpdated,
    country_skipped: countrySkipped,
    country_failed: countryFailed,
    admin1_countries_processed: admin1Countries.length,
    admin1_created: admin1Created,
    admin1_updated: admin1Updated,
    admin1_skipped: admin1Skipped,
    admin1_failed: admin1Failed,
    compiled: !noCompile && anyChanged,
  });
}

async function cmdFillGoogleCars(args) {
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-google-cars [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(GOOGLE_CAR_HINT_TYPE);

  let categoryHtml;
  try {
    const res = await fetch(GOOGLE_CAR_CATEGORY_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    categoryHtml = await res.text();
  } catch (error) {
    console.error(`Failed to load Geometas category: ${String(error)}`);
    process.exit(1);
  }

  const cards = parseGoogleCarCategoryCards(categoryHtml);
  if (cards.length === 0) {
    console.error("No Google Car cards found on Geometas category page.");
    return;
  }

  const regionResp = await api("GET", "/api/regions?region_level=country&limit=2000");
  const countries = Array.isArray(regionResp.items) ? regionResp.items : [];
  if (countries.length === 0) {
    console.error("No country regions found.");
    return;
  }

  const countryLookup = new Map();
  const indexCountry = (key, region) => {
    const normalized = normalizeCountryLookup(key);
    if (!normalized || countryLookup.has(normalized)) return;
    countryLookup.set(normalized, region);
  };

  for (const region of countries) {
    indexCountry(region?.name, region);
    indexCountry(region?.name_en, region);
    indexCountry(region?.country_code, region);
  }

  const resolveRegion = (countryLabel) => {
    const alias = GOOGLE_CAR_COUNTRY_ALIASES[countryLabel] || countryLabel;
    return countryLookup.get(normalizeCountryLookup(alias)) || null;
  };

  const regionStateById = new Map();
  const loadRegionState = async (regionId) => {
    if (regionStateById.has(regionId)) {
      return regionStateById.get(regionId);
    }
    const region = await api("GET", `/api/regions/${encodeURIComponent(regionId)}`);
    const hints = Array.isArray(region?.hints) ? region.hints : [];
    const seededBySource = new Map();
    for (const hint of hints) {
      if (hint?.hint_type_code !== GOOGLE_CAR_HINT_TYPE) continue;
      if (typeof hint?.source_note !== "string") continue;
      if (!hint.source_note.startsWith(`${GOOGLE_CAR_SOURCE} `)) continue;
      seededBySource.set(hint.source_note, hint);
    }
    const state = {
      seededBySource,
    };
    regionStateById.set(regionId, state);
    return state;
  };

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;
  let skippedCountry = 0;
  let filteredOut = 0;
  let failed = 0;
  let uploaded = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const region = resolveRegion(card.country);
    if (!region) {
      skippedCountry++;
      console.error(
        `[${i + 1}/${cards.length}] skip ${card.country}: country not mapped`
      );
      continue;
    }

    const regionCountry = String(region.country_code || "").toUpperCase();
    if (countryFilter && regionCountry !== countryFilter) {
      filteredOut++;
      continue;
    }

    const sourceNote = `${GOOGLE_CAR_SOURCE} ${card.sourceUrl}`;
    const state = await loadRegionState(region.id);
    const existing = state.seededBySource.get(sourceNote);

    if (!force && existing) {
      skippedExisting++;
      continue;
    }

    try {
      const asset = await uploadAssetFromUrl(card.imageUrl, {
        kind: "sample",
        caption: `${card.country} Google Car`,
        fatal: false,
      });
      uploaded++;

      const generation = inferGoogleCarGeneration(card.description);
      const hasBlur = inferGoogleCarHasBlur(card.description);
      const existingData =
        existing && existing.data_json && typeof existing.data_json === "object"
          ? existing.data_json
          : {};
      const dataJson = { ...existingData };
      if (generation) dataJson.generation = generation;
      if (hasBlur !== null) dataJson.has_blur = hasBlur;

      if (existing) {
        const result = await api(
          "PUT",
          `/api/hints/${encodeURIComponent(existing.id)}`,
          {
            region_id: existing.region_id || region.id,
            hint_type_code: GOOGLE_CAR_HINT_TYPE,
            short_value: existing.short_value ?? "Google Car",
            full_value: card.description || existing.full_value || `Google Car meta for ${card.country}`,
            data_json: Object.keys(dataJson).length > 0 ? dataJson : null,
            color: existing.color ?? null,
            confidence: existing.confidence ?? 1.0,
            min_zoom: existing.min_zoom ?? 2.0,
            max_zoom: existing.max_zoom ?? 11.0,
            is_visible: existing.is_visible ?? true,
            image_asset_id: asset.id,
            icon_asset_id: existing.icon_asset_id ?? null,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        state.seededBySource.set(sourceNote, result);
        updated++;
        console.error(`[${i + 1}/${cards.length}] updated ${card.country}`);
      } else {
        const ordinal = state.seededBySource.size + 1;
        const shortValue = ordinal > 1 ? `Google Car #${ordinal}` : "Google Car";
        const result = await api(
          "POST",
          "/api/hints",
          {
            region_id: region.id,
            hint_type_code: GOOGLE_CAR_HINT_TYPE,
            short_value: shortValue,
            full_value: card.description || `Google Car meta for ${card.country}`,
            data_json: Object.keys(dataJson).length > 0 ? dataJson : null,
            confidence: 1.0,
            min_zoom: 2.0,
            max_zoom: 11.0,
            is_visible: true,
            image_asset_id: asset.id,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        state.seededBySource.set(sourceNote, result);
        created++;
        console.error(`[${i + 1}/${cards.length}] created ${card.country}`);
      }
    } catch (error) {
      failed++;
      console.error(
        `[${i + 1}/${cards.length}] failed ${card.country} (${card.sourceUrl}): ${String(error)}`
      );
    }
  }

  const anyChanged = created > 0 || updated > 0;
  if (!noCompile && anyChanged) {
    await api("POST", "/api/layers/compile", {
      hint_type_codes: [GOOGLE_CAR_HINT_TYPE],
    });
  }

  printJson({
    hint_type_code: GOOGLE_CAR_HINT_TYPE,
    source: GOOGLE_CAR_SOURCE,
    category_url: GOOGLE_CAR_CATEGORY_URL,
    cards_total: cards.length,
    created,
    updated,
    uploaded,
    skipped_existing: skippedExisting,
    skipped_country: skippedCountry,
    filtered_out: filteredOut,
    failed,
    compiled: !noCompile && anyChanged,
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
  case "fill-phone-codes":
    await cmdFillPhoneCodes(args);
    break;
  case "fill-google-cars":
    await cmdFillGoogleCars(args);
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
  fill-phone-codes [--country XX] [--force] [--no-compile]
                                        Upsert phone_hint hints (+7, +44, +1 205, ...)
  fill-google-cars [--country XX] [--force] [--no-compile]
                                        Import Google Car hints from Geometas
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
