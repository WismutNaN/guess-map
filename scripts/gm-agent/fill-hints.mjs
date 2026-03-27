/**
 * Heavy web-import commands for gm-agent.
 * Kept in a dedicated module to keep scripts/gm-agent.mjs small and navigable.
 */

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
const POLE_HINT_TYPE = "pole";
const POLE_SOURCE = "geometas:pole";
const POLE_CATEGORY_URL = "https://www.geometas.com/metas/categories/poles/";
const POLE_DETAIL_BASE = "https://www.geometas.com";
const POLE_DETAIL_COUNTRY_OVERRIDES = {
  "cd91da35-b515-4d3e-b308-9d40e0519a23": "CW", // Curacao
};
const POLE_COUNTRY_ALIASES = {
  Curacao: "CW",
  Curaçao: "CW",
  "South Korea": "KR",
  "North Macedonia": "MK",
};
const CAMERA_GENS_URL = "https://geohints.com/meta/cameraGens";
const CAMERA_GENS_SOURCE = "geohints:camera_gens";
const CAMERA_GENS_TAG_SOURCE = "geohints:camera_gens_tag";
const CAMERA_GENS_TAG_HINT_TYPE = "camera_gens_tag";
const CAMERA_GENS_LAYER_TYPES = [
  {
    mapId: "Gen 1",
    label: "Gen 1",
    hintTypeCode: "camera_gen1",
    slug: "gen1",
    color: "#ef4444",
  },
  {
    mapId: "Gen 2",
    label: "Gen 2",
    hintTypeCode: "camera_gen2",
    slug: "gen2",
    color: "#f97316",
  },
  {
    mapId: "Gen 3",
    label: "Gen 3",
    hintTypeCode: "camera_gen3",
    slug: "gen3",
    color: "#f59e0b",
  },
  {
    mapId: "Gen 4",
    label: "Gen 4",
    hintTypeCode: "camera_gen4",
    slug: "gen4",
    color: "#22c55e",
  },
  {
    mapId: "Low Cam",
    label: "Low Cam",
    hintTypeCode: "camera_low_cam",
    slug: "low_cam",
    color: "#06b6d4",
  },
  {
    mapId: "Shit Cam",
    label: "Shit Cam",
    hintTypeCode: "camera_shit_cam",
    slug: "shit_cam",
    color: "#a855f7",
  },
  {
    mapId: "Small Cam",
    label: "Small Cam",
    hintTypeCode: "camera_small_cam",
    slug: "small_cam",
    color: "#14b8a6",
  },
  {
    mapId: "Trekker (Gen2)",
    label: "Trekker (Gen2)",
    hintTypeCode: "camera_trekker_gen2",
    slug: "trekker_gen2",
    color: "#6366f1",
  },
  {
    mapId: "Trekker (Gen3)",
    label: "Trekker (Gen3)",
    hintTypeCode: "camera_trekker_gen3",
    slug: "trekker_gen3",
    color: "#8b5cf6",
  },
  {
    mapId: "Trekker (Gen4)",
    label: "Trekker (Gen4)",
    hintTypeCode: "camera_trekker_gen4",
    slug: "trekker_gen4",
    color: "#ec4899",
  },
];
const CAMERA_GENS_COUNTRY_ALIASES = {
  "Czech Republic": "CZ",
  "Macao": "MO",
  "Åland": "AX",
  "Aland": "AX",
  "Curaçao": "CW",
  "Curacao": "CW",
  "Faroe Islands": "FO",
  "Isle of Man": "IM",
  "Christmas Island": "CX",
  "Cocos (Keeling) Islands": "CC",
  "South Korea": "KR",
  "North Macedonia": "MK",
  "Bosnia and Herzegovina": "BA",
  "United States Virgin Islands": "VI",
  "United States Minor Outlying Islands": "UM",
  "British Indian Ocean Territory": "IO",
  "Falkland Islands": "FK",
  "São Tomé and Príncipe": "ST",
  "Sao Tome and Principe": "ST",
};
const SNOW_COVERAGE_URL = "https://geohints.com/meta/snow";
const SNOW_COVERAGE_SOURCE = "geohints:snow";
const SNOW_HINT_TYPE = "snow_coverage";
const SNOW_LEGACY_HINT_TYPES = ["snow_outdoor", "snow_indoor"];
const SNOW_CATEGORY_CONFIG = {
  Indoor: {
    label: "Indoor",
    mode: "indoor",
    color: "#4393c3",
  },
  Outdoor: {
    label: "Outdoor",
    mode: "outdoor",
    color: "#cc3333",
  },
  Both: {
    label: "Both",
    mode: "both",
    color: "#f781be",
  },
};
const SNOW_COUNTRY_ALIASES = {
  ...CAMERA_GENS_COUNTRY_ALIASES,
};
const ARCHITECTURE_HINT_TYPE = "architecture";
const ARCHITECTURE_SOURCE = "geohints:architecture";
const ARCHITECTURE_URL = "https://geohints.com/meta/architecture";
const ARCHITECTURE_COUNTRY_ALIASES = {
  "South Korea": "KR",
  "United States": "US",
  "United Kingdom": "GB",
};

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

function normalizePoleCountry(rawCountry, detailId) {
  const decoded = decodeHtmlEntities(rawCountry).replace(/\s+/g, " ").trim();
  const withoutPrefix = decoded.replace(/^[^\p{L}\p{N}]+/u, "").trim();

  if (withoutPrefix && withoutPrefix !== "None") {
    return POLE_COUNTRY_ALIASES[withoutPrefix] || withoutPrefix;
  }

  const fallback = POLE_DETAIL_COUNTRY_OVERRIDES[detailId];
  return fallback || null;
}

function parsePoleCategoryCards(html) {
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
    const country = normalizePoleCountry(match[4], detailId);
    if (!country || !imageUrl) continue;

    cards.push({
      detailId,
      sourceUrl: new URL(detailPath, POLE_DETAIL_BASE).toString(),
      imageUrl,
      description,
      country,
    });
  }

  return cards;
}

function parseArchitectureCards(html) {
  const tokenRegex =
    /<div class="text-center text-3xl font-bold">\s*([^<]+?)\s*<\/div>|<div class="text-white text-md p-2 ">\s*<span class="font-bold">\s*([^<]+?)\s*<\/span>\s*<img[^>]*src="([^"]+)"[^>]*>\s*<a href="([^"]+)"/gi;

  let continent = null;
  const cards = [];
  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      continent = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
      continue;
    }

    if (!match[2] || !match[3]) continue;
    const country = decodeHtmlEntities(match[2]).replace(/\s+/g, " ").trim();
    const rawImageUrl = decodeHtmlEntities(match[3]).trim();
    const rawMapUrl = decodeHtmlEntities(match[4] || "").trim();
    if (!country || !rawImageUrl) continue;

    const imageUrl = new URL(rawImageUrl, ARCHITECTURE_URL).toString();
    const mapUrl = rawMapUrl ? new URL(rawMapUrl, ARCHITECTURE_URL).toString() : null;
    cards.push({
      country,
      continent,
      imageUrl,
      mapUrl,
      sourceUrl: ARCHITECTURE_URL,
    });
  }

  return cards;
}

function parseCameraGensMaps(html) {
  const sections = new Map();
  const blockRegex =
    /initSimpleMapChart\(document\.getElementById\("([^"]+)"\),\s*\{[\s\S]*?data:\s*\{([\s\S]*?)\}\s*,\s*legend:/g;

  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const mapId = decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
    const dataBlock = match[2];
    const countries = new Map();

    const pairRegex = /"([^"]+)":\s*"([^"]*)"/g;
    let pairMatch;
    while ((pairMatch = pairRegex.exec(dataBlock)) !== null) {
      const country = decodeHtmlEntities(pairMatch[1]).replace(/\s+/g, " ").trim();
      const value = decodeHtmlEntities(pairMatch[2]).replace(/\s+/g, " ").trim();
      if (!country) continue;
      countries.set(country, value);
    }

    if (mapId && countries.size > 0) {
      sections.set(mapId, countries);
    }
  }

  return sections;
}

function resolveCameraGensRegion(countryLabel, countryLookup) {
  const alias = CAMERA_GENS_COUNTRY_ALIASES[countryLabel] || countryLabel;
  return countryLookup.get(normalizeCountryLookup(alias)) || null;
}

function resolveSnowCoverageRegion(countryLabel, countryLookup) {
  const alias = SNOW_COUNTRY_ALIASES[countryLabel] || countryLabel;
  return countryLookup.get(normalizeCountryLookup(alias)) || null;
}

function resolveArchitectureRegion(countryLabel, countryLookup) {
  const alias = ARCHITECTURE_COUNTRY_ALIASES[countryLabel] || countryLabel;
  return countryLookup.get(normalizeCountryLookup(alias)) || null;
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

function inferPoleMaterial(description) {
  if (typeof description !== "string" || !description.trim()) return null;
  const patterns = [
    ["concrete", /\bconcrete\b/i],
    ["wood", /\bwood(?:en)?\b/i],
    ["metal", /\b(?:metal|steel|metallic)\b/i],
  ];
  for (const [value, pattern] of patterns) {
    if (pattern.test(description)) return value;
  }
  return null;
}

function inferPoleColor(description) {
  if (typeof description !== "string" || !description.trim()) return null;
  const colors = [
    "black",
    "white",
    "red",
    "yellow",
    "grey",
    "gray",
    "green",
    "blue",
    "silver",
    "olive",
  ];
  const found = colors.find((color) =>
    new RegExp(`\\b${color}\\b`, "i").test(description)
  );
  if (!found) return null;
  return found === "gray" ? "grey" : found;
}

export async function cmdFillGoogleCars(args, deps) {
  const { api, ensureHintTypeExists, uploadAssetFromUrl, printJson } = deps;
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

export async function cmdFillPoles(args, deps) {
  const { api, ensureHintTypeExists, uploadAssetFromUrl, printJson } = deps;
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-poles [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(POLE_HINT_TYPE);

  let categoryHtml;
  try {
    const res = await fetch(POLE_CATEGORY_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    categoryHtml = await res.text();
  } catch (error) {
    console.error(`Failed to load Geometas category: ${String(error)}`);
    process.exit(1);
  }

  const cards = parsePoleCategoryCards(categoryHtml);
  if (cards.length === 0) {
    console.error("No poles cards found on Geometas category page.");
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
    const alias = POLE_COUNTRY_ALIASES[countryLabel] || countryLabel;
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
      if (hint?.hint_type_code !== POLE_HINT_TYPE) continue;
      if (typeof hint?.source_note !== "string") continue;
      if (!hint.source_note.startsWith(`${POLE_SOURCE} `)) continue;
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

    const sourceNote = `${POLE_SOURCE} ${card.sourceUrl}`;
    const state = await loadRegionState(region.id);
    const existing = state.seededBySource.get(sourceNote);

    if (!force && existing) {
      skippedExisting++;
      continue;
    }

    try {
      const asset = await uploadAssetFromUrl(card.imageUrl, {
        kind: "sample",
        caption: `${card.country} Pole`,
        fatal: false,
      });
      uploaded++;

      const material = inferPoleMaterial(card.description);
      const poleColor = inferPoleColor(card.description);
      const existingData =
        existing && existing.data_json && typeof existing.data_json === "object"
          ? existing.data_json
          : {};
      const dataJson = { ...existingData };
      if (material) dataJson.material = material;
      if (poleColor) dataJson.color = poleColor;

      if (existing) {
        const result = await api(
          "PUT",
          `/api/hints/${encodeURIComponent(existing.id)}`,
          {
            region_id: existing.region_id || region.id,
            hint_type_code: POLE_HINT_TYPE,
            short_value: existing.short_value ?? "Pole",
            full_value: card.description || existing.full_value || `Pole hint for ${card.country}`,
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
        const shortValue = ordinal > 1 ? `Pole #${ordinal}` : "Pole";
        const result = await api(
          "POST",
          "/api/hints",
          {
            region_id: region.id,
            hint_type_code: POLE_HINT_TYPE,
            short_value: shortValue,
            full_value: card.description || `Pole hint for ${card.country}`,
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
      hint_type_codes: [POLE_HINT_TYPE],
    });
  }

  printJson({
    hint_type_code: POLE_HINT_TYPE,
    source: POLE_SOURCE,
    category_url: POLE_CATEGORY_URL,
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

export async function cmdFillCameraGens(args, deps) {
  const { api, ensureHintTypeExists, uploadAssetFromUrl, printJson } = deps;
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-camera-gens [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  for (const cfg of CAMERA_GENS_LAYER_TYPES) {
    await ensureHintTypeExists(cfg.hintTypeCode);
  }
  await ensureHintTypeExists(CAMERA_GENS_TAG_HINT_TYPE);

  let pageHtml;
  try {
    const response = await fetch(CAMERA_GENS_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    pageHtml = await response.text();
  } catch (error) {
    console.error(`Failed to load GeoHints camera gens page: ${String(error)}`);
    process.exit(1);
  }

  const mapSections = parseCameraGensMaps(pageHtml);
  const missingSections = CAMERA_GENS_LAYER_TYPES
    .map((cfg) => cfg.mapId)
    .filter((id) => !mapSections.has(id));
  if (missingSections.length > 0) {
    console.error(
      `Warning: missing camera-gens map sections on source page: ${missingSections.join(", ")}`
    );
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

  const cameraLayerCodes = new Set(CAMERA_GENS_LAYER_TYPES.map((cfg) => cfg.hintTypeCode));
  const regionStateById = new Map();
  const loadRegionState = async (regionId) => {
    if (regionStateById.has(regionId)) {
      return regionStateById.get(regionId);
    }

    const region = await api("GET", `/api/regions/${encodeURIComponent(regionId)}`);
    const hints = Array.isArray(region?.hints) ? region.hints : [];
    const seededByType = new Map();
    let seededTag = null;

    for (const hint of hints) {
      if (typeof hint?.hint_type_code !== "string") continue;
      if (typeof hint?.source_note !== "string") continue;

      if (
        cameraLayerCodes.has(hint.hint_type_code) &&
        hint.source_note.startsWith(`${CAMERA_GENS_SOURCE} `) &&
        !seededByType.has(hint.hint_type_code)
      ) {
        seededByType.set(hint.hint_type_code, hint);
        continue;
      }

      if (
        hint.hint_type_code === CAMERA_GENS_TAG_HINT_TYPE &&
        hint.source_note.startsWith(`${CAMERA_GENS_TAG_SOURCE} `) &&
        !seededTag
      ) {
        seededTag = hint;
      }
    }

    const state = { region, seededByType, seededTag };
    regionStateById.set(regionId, state);
    return state;
  };

  const summaryLabelsByRegion = new Map();
  const touchedHintTypes = new Set();

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;
  let skippedCountry = 0;
  let filteredOut = 0;
  let failed = 0;

  for (const cfg of CAMERA_GENS_LAYER_TYPES) {
    const countriesMap = mapSections.get(cfg.mapId);
    if (!countriesMap) continue;

    for (const [countryLabel] of countriesMap.entries()) {
      const region = resolveCameraGensRegion(countryLabel, countryLookup);
      if (!region) {
        skippedCountry++;
        continue;
      }

      const regionCountry = String(region.country_code || "").toUpperCase();
      if (countryFilter && regionCountry !== countryFilter) {
        filteredOut++;
        continue;
      }

      let labels = summaryLabelsByRegion.get(region.id);
      if (!labels) {
        labels = new Set();
        summaryLabelsByRegion.set(region.id, labels);
      }
      labels.add(cfg.label);

      const state = await loadRegionState(region.id);
      const existing = state.seededByType.get(cfg.hintTypeCode);

      if (!force && existing) {
        skippedExisting++;
        continue;
      }

      const sourceNote = `${CAMERA_GENS_SOURCE} ${CAMERA_GENS_URL}#${cfg.slug}`;
      const existingData =
        existing && existing.data_json && typeof existing.data_json === "object"
          ? existing.data_json
          : {};
      const dataJson = {
        ...existingData,
        category: cfg.slug,
        label: cfg.label,
      };

      try {
        if (existing) {
          const result = await api(
            "PUT",
            `/api/hints/${encodeURIComponent(existing.id)}`,
            {
              region_id: existing.region_id || region.id,
              hint_type_code: cfg.hintTypeCode,
              short_value: cfg.label,
              full_value: `Camera layer ${cfg.label}`,
              data_json: dataJson,
              color: cfg.color,
              confidence: existing.confidence ?? 1.0,
              min_zoom: existing.min_zoom ?? 2.0,
              max_zoom: existing.max_zoom ?? 10.0,
              is_visible: existing.is_visible ?? true,
              image_asset_id: existing.image_asset_id ?? null,
              icon_asset_id: existing.icon_asset_id ?? null,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          state.seededByType.set(cfg.hintTypeCode, result);
          updated++;
        } else {
          const result = await api(
            "POST",
            "/api/hints",
            {
              region_id: region.id,
              hint_type_code: cfg.hintTypeCode,
              short_value: cfg.label,
              full_value: `Camera layer ${cfg.label}`,
              data_json: dataJson,
              color: cfg.color,
              confidence: 1.0,
              min_zoom: 2.0,
              max_zoom: 10.0,
              is_visible: true,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          state.seededByType.set(cfg.hintTypeCode, result);
          created++;
        }
        touchedHintTypes.add(cfg.hintTypeCode);
      } catch (error) {
        failed++;
        console.error(
          `[${cfg.label}] failed ${countryLabel} (${region.id}): ${String(error)}`
        );
      }
    }
  }

  let tagCreated = 0;
  let tagUpdated = 0;
  let tagSkipped = 0;
  let tagFailed = 0;

  for (const [regionId, labelsSet] of summaryLabelsByRegion.entries()) {
    const orderedLabels = CAMERA_GENS_LAYER_TYPES.map((cfg) => cfg.label).filter((label) =>
      labelsSet.has(label)
    );
    if (orderedLabels.length === 0) continue;

    const state = await loadRegionState(regionId);
    const existing = state.seededTag;
    const shortValue = orderedLabels.join(" | ");
    const fullValue = `Camera generations: ${orderedLabels.join(", ")}`;
    const dataJson = {
      tags: orderedLabels,
      count: orderedLabels.length,
    };
    const sourceNote = `${CAMERA_GENS_TAG_SOURCE} ${CAMERA_GENS_URL}`;
    const unchanged =
      existing &&
      String(existing.short_value || "").trim() === shortValue &&
      String(existing.full_value || "").trim() === fullValue;

    if (!force && unchanged) {
      tagSkipped++;
      continue;
    }

    try {
      if (existing) {
        const result = await api(
          "PUT",
          `/api/hints/${encodeURIComponent(existing.id)}`,
          {
            region_id: existing.region_id || regionId,
            hint_type_code: CAMERA_GENS_TAG_HINT_TYPE,
            short_value: shortValue,
            full_value: fullValue,
            data_json: dataJson,
            color: existing.color ?? null,
            confidence: existing.confidence ?? 1.0,
            min_zoom: existing.min_zoom ?? 2.0,
            max_zoom: existing.max_zoom ?? 11.0,
            is_visible: existing.is_visible ?? true,
            image_asset_id: existing.image_asset_id ?? null,
            icon_asset_id: existing.icon_asset_id ?? null,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        state.seededTag = result;
        tagUpdated++;
      } else {
        const result = await api(
          "POST",
          "/api/hints",
          {
            region_id: regionId,
            hint_type_code: CAMERA_GENS_TAG_HINT_TYPE,
            short_value: shortValue,
            full_value: fullValue,
            data_json: dataJson,
            confidence: 1.0,
            min_zoom: 2.0,
            max_zoom: 11.0,
            is_visible: true,
            source_note: sourceNote,
          },
          { fatal: false }
        );
        state.seededTag = result;
        tagCreated++;
      }
      touchedHintTypes.add(CAMERA_GENS_TAG_HINT_TYPE);
    } catch (error) {
      tagFailed++;
      console.error(`[camera_gens_tag] failed ${regionId}: ${String(error)}`);
    }
  }

  const compiledCodes = [...touchedHintTypes];
  if (!noCompile && compiledCodes.length > 0) {
    await api("POST", "/api/layers/compile", {
      hint_type_codes: compiledCodes,
    });
  }

  printJson({
    source: CAMERA_GENS_SOURCE,
    category_url: CAMERA_GENS_URL,
    layer_count: CAMERA_GENS_LAYER_TYPES.length,
    missing_sections: missingSections,
    created,
    updated,
    skipped_existing: skippedExisting,
    skipped_country: skippedCountry,
    filtered_out: filteredOut,
    failed,
    tag_hint_type_code: CAMERA_GENS_TAG_HINT_TYPE,
    tag_created: tagCreated,
    tag_updated: tagUpdated,
    tag_skipped: tagSkipped,
    tag_failed: tagFailed,
    compiled: !noCompile && compiledCodes.length > 0,
    compiled_hint_types: !noCompile && compiledCodes.length > 0 ? compiledCodes : [],
  });
}

export async function cmdFillSnowCoverage(args, deps) {
  const { api, ensureHintTypeExists, uploadAssetFromUrl, printJson } = deps;
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-snow-coverage [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(SNOW_HINT_TYPE);

  let pageHtml;
  try {
    const response = await fetch(SNOW_COVERAGE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    pageHtml = await response.text();
  } catch (error) {
    console.error(`Failed to load GeoHints snow page: ${String(error)}`);
    process.exit(1);
  }

  const mapSections = parseCameraGensMaps(pageHtml);
  const snowMap = mapSections.get("map");
  if (!snowMap || snowMap.size === 0) {
    console.error("No snow coverage map data found on GeoHints page.");
    process.exit(1);
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

  const snowLayerCodes = new Set([SNOW_HINT_TYPE, ...SNOW_LEGACY_HINT_TYPES]);
  const regionStateById = new Map();
  const loadRegionState = async (regionId) => {
    if (regionStateById.has(regionId)) {
      return regionStateById.get(regionId);
    }

    const region = await api("GET", `/api/regions/${encodeURIComponent(regionId)}`);
    const hints = Array.isArray(region?.hints) ? region.hints : [];
    let seeded = null;
    const legacyHints = [];

    for (const hint of hints) {
      if (typeof hint?.hint_type_code !== "string") continue;
      if (typeof hint?.source_note !== "string") continue;
      if (!snowLayerCodes.has(hint.hint_type_code)) continue;
      if (!hint.source_note.startsWith(`${SNOW_COVERAGE_SOURCE} `)) continue;

      if (hint.hint_type_code === SNOW_HINT_TYPE) {
        if (!seeded) {
          seeded = hint;
        } else {
          legacyHints.push(hint);
        }
      } else {
        legacyHints.push(hint);
      }
    }

    const state = { region, seeded, legacyHints };
    regionStateById.set(regionId, state);
    return state;
  };

  const touchedHintTypes = new Set();

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skippedExisting = 0;
  let skippedCountry = 0;
  let filteredOut = 0;
  let skippedCategory = 0;
  let failed = 0;

  for (const [countryLabel, rawCategory] of snowMap.entries()) {
    const region = resolveSnowCoverageRegion(countryLabel, countryLookup);
    if (!region) {
      skippedCountry++;
      continue;
    }

    const regionCountry = String(region.country_code || "").toUpperCase();
    if (countryFilter && regionCountry !== countryFilter) {
      filteredOut++;
      continue;
    }

    const category = String(rawCategory || "").trim();
    const cfg = SNOW_CATEGORY_CONFIG[category];
    if (!cfg) {
      skippedCategory++;
      continue;
    }

    const state = await loadRegionState(region.id);

    const sourceNote = `${SNOW_COVERAGE_SOURCE} ${SNOW_COVERAGE_URL}`;
    const existing = state.seeded;
    if (!force && existing) {
      skippedExisting++;
    } else {
      const existingData =
        existing && existing.data_json && typeof existing.data_json === "object"
          ? existing.data_json
          : {};
      const dataJson = {
        ...existingData,
        mode: cfg.mode,
        source_category: category,
      };

      try {
        if (existing) {
          const result = await api(
            "PUT",
            `/api/hints/${encodeURIComponent(existing.id)}`,
            {
              region_id: existing.region_id || region.id,
              hint_type_code: SNOW_HINT_TYPE,
              short_value: cfg.label,
              full_value: `Snow coverage (${cfg.label.toLowerCase()})`,
              data_json: dataJson,
              color: cfg.color,
              confidence: existing.confidence ?? 1.0,
              min_zoom: existing.min_zoom ?? 2.0,
              max_zoom: existing.max_zoom ?? 10.0,
              is_visible: existing.is_visible ?? true,
              image_asset_id: existing.image_asset_id ?? null,
              icon_asset_id: existing.icon_asset_id ?? null,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          state.seeded = result;
          updated++;
        } else {
          const result = await api(
            "POST",
            "/api/hints",
            {
              region_id: region.id,
              hint_type_code: SNOW_HINT_TYPE,
              short_value: cfg.label,
              full_value: `Snow coverage (${cfg.label.toLowerCase()})`,
              data_json: dataJson,
              color: cfg.color,
              confidence: 1.0,
              min_zoom: 2.0,
              max_zoom: 10.0,
              is_visible: true,
              source_note: sourceNote,
            },
            { fatal: false }
          );
          state.seeded = result;
          created++;
        }
        touchedHintTypes.add(SNOW_HINT_TYPE);
      } catch (error) {
        failed++;
        console.error(
          `[snow ${cfg.mode}] failed ${countryLabel} (${region.id}): ${String(error)}`
        );
      }
    }

    if (state.legacyHints.length > 0) {
      for (const legacyHint of [...state.legacyHints]) {
        try {
          await api(
            "DELETE",
            `/api/hints/${encodeURIComponent(legacyHint.id)}`,
            undefined,
            { fatal: false }
          );
          state.legacyHints = state.legacyHints.filter((it) => it.id !== legacyHint.id);
          deleted++;
          touchedHintTypes.add(SNOW_HINT_TYPE);
        } catch (error) {
          failed++;
          console.error(
            `[snow legacy] delete failed ${countryLabel} (${region.id}): ${String(error)}`
          );
        }
      }
    }
  }

  const compiledCodes = [...touchedHintTypes];
  if (!noCompile && compiledCodes.length > 0) {
    await api("POST", "/api/layers/compile", {
      hint_type_codes: compiledCodes,
    });
  }

  printJson({
    source: SNOW_COVERAGE_SOURCE,
    category_url: SNOW_COVERAGE_URL,
    countries_total: snowMap.size,
    created,
    updated,
    deleted,
    skipped_existing: skippedExisting,
    skipped_country: skippedCountry,
    filtered_out: filteredOut,
    skipped_category: skippedCategory,
    failed,
    compiled: !noCompile && compiledCodes.length > 0,
    compiled_hint_types: !noCompile && compiledCodes.length > 0 ? compiledCodes : [],
  });
}

export async function cmdFillArchitecture(args, deps) {
  const { api, ensureHintTypeExists, uploadAssetFromUrl, printJson } = deps;
  let countryFilter = null;
  let force = false;
  let noCompile = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--country") countryFilter = (args[++i] || "").toUpperCase();
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--no-compile") noCompile = true;
  }

  if (countryFilter && !/^[A-Z]{2}$/.test(countryFilter)) {
    console.error("Usage: fill-architecture [--country XX] [--force] [--no-compile]");
    process.exit(1);
  }

  await ensureHintTypeExists(ARCHITECTURE_HINT_TYPE);

  let pageHtml;
  try {
    const response = await fetch(ARCHITECTURE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    pageHtml = await response.text();
  } catch (error) {
    console.error(`Failed to load GeoHints architecture page: ${String(error)}`);
    process.exit(1);
  }

  const cards = parseArchitectureCards(pageHtml);
  if (cards.length === 0) {
    console.error("No architecture cards found on GeoHints page.");
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

  const regionStateById = new Map();
  const loadRegionState = async (regionId) => {
    if (regionStateById.has(regionId)) {
      return regionStateById.get(regionId);
    }
    const region = await api("GET", `/api/regions/${encodeURIComponent(regionId)}`);
    const hints = Array.isArray(region?.hints) ? region.hints : [];
    const seededBySource = new Map();
    for (const hint of hints) {
      if (hint?.hint_type_code !== ARCHITECTURE_HINT_TYPE) continue;
      if (typeof hint?.source_note !== "string") continue;
      if (!hint.source_note.startsWith(`${ARCHITECTURE_SOURCE} `)) continue;
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
    const region = resolveArchitectureRegion(card.country, countryLookup);
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

    const sourceNote = `${ARCHITECTURE_SOURCE} ${card.imageUrl}`;
    const state = await loadRegionState(region.id);
    const existing = state.seededBySource.get(sourceNote);

    if (!force && existing) {
      skippedExisting++;
      continue;
    }

    try {
      const asset = await uploadAssetFromUrl(card.imageUrl, {
        kind: "sample",
        caption: `${card.country} architecture`,
        fatal: false,
      });
      uploaded++;

      const existingData =
        existing && existing.data_json && typeof existing.data_json === "object"
          ? existing.data_json
          : {};
      const dataJson = { ...existingData };
      if (card.continent) dataJson.continent = card.continent;
      if (card.mapUrl) dataJson.map_url = card.mapUrl;
      dataJson.image_url = card.imageUrl;

      const fullValue = card.continent
        ? `${card.country} architecture (${card.continent})`
        : `${card.country} architecture`;

      if (existing) {
        const result = await api(
          "PUT",
          `/api/hints/${encodeURIComponent(existing.id)}`,
          {
            region_id: existing.region_id || region.id,
            hint_type_code: ARCHITECTURE_HINT_TYPE,
            short_value: existing.short_value ?? "Architecture",
            full_value: fullValue,
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
        const shortValue = ordinal > 1 ? `Architecture #${ordinal}` : "Architecture";
        const result = await api(
          "POST",
          "/api/hints",
          {
            region_id: region.id,
            hint_type_code: ARCHITECTURE_HINT_TYPE,
            short_value: shortValue,
            full_value: fullValue,
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
        `[${i + 1}/${cards.length}] failed ${card.country} (${card.imageUrl}): ${String(error)}`
      );
    }
  }

  const anyChanged = created > 0 || updated > 0;
  if (!noCompile && anyChanged) {
    await api("POST", "/api/layers/compile", {
      hint_type_codes: [ARCHITECTURE_HINT_TYPE],
    });
  }

  printJson({
    hint_type_code: ARCHITECTURE_HINT_TYPE,
    source: ARCHITECTURE_SOURCE,
    source_url: ARCHITECTURE_URL,
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
