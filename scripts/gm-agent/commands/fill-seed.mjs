const FLAG_ICONS_VERSION = "7.5.0";
const FLAG_ICONS_BASE = `https://cdn.jsdelivr.net/gh/lipis/flag-icons@${FLAG_ICONS_VERSION}/flags/4x3`;

const COUNTRY_DOMAIN_HINT_TYPE = "country_domain";
const COUNTRY_DOMAIN_SOURCE = "seed:country_tld";

const PHONE_HINT_TYPE = "phone_hint";
const PHONE_COUNTRY_SOURCE = "seed:phone_country";
const PHONE_ADMIN1_SOURCE = "seed:phone_admin1";
const PHONE_COUNTRY_DATA_PATH = "../../../assets/metadata/phone_country_codes.json";
const PHONE_ADMIN1_DATA_PATH = "../../../assets/metadata/phone_admin1_codes.json";

async function cmdFillFlagsSvg(args, ctx) {
  const { api, uploadAssetFromUrl, printJson, countryCodeToFlagEmoji } = ctx;
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

async function cmdFillCountryDomains(args, ctx) {
  const { api, ensureHintTypeExists, printJson, countryCodeToDomain } = ctx;
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

async function cmdFillPhoneCodes(args, ctx) {
  const { api, ensureHintTypeExists, readJsonAsset, normalizeRegionRef, printJson } = ctx;
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
    countryCatalog = readJsonAsset(PHONE_COUNTRY_DATA_PATH, import.meta.url);
    admin1Catalog = readJsonAsset(PHONE_ADMIN1_DATA_PATH, import.meta.url);
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

export const fillSeedCommands = [
  {
    name: "fill-flags-svg",
    usage: "fill-flags-svg [--country XX] [--force] [--no-compile]",
    description: "Upload SVG flags + upsert country hints",
    run: cmdFillFlagsSvg,
  },
  {
    name: "fill-country-domains",
    usage: "fill-country-domains [--country XX] [--force] [--no-compile]",
    description: "Upsert country_domain hints (.ru, .uk, ...)",
    run: cmdFillCountryDomains,
  },
  {
    name: "fill-phone-codes",
    usage: "fill-phone-codes [--country XX] [--force] [--no-compile]",
    description: "Upsert phone_hint hints (+7, +44, +1 205, ...)",
    run: cmdFillPhoneCodes,
  },
];

export const commands = fillSeedCommands;
