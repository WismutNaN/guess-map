import { readFileSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";

const COUNTRY_TLD_OVERRIDES = {
  GB: "uk",
};

export function createAgentContext(env = process.env) {
  const host = env.GM_API_HOST || "127.0.0.1";
  const port = env.GM_API_PORT || "21345";
  const token = env.GM_API_TOKEN;
  const base = `http://${host}:${port}`;

  if (!token) {
    console.error(
      "Error: GM_API_TOKEN environment variable is required.\n" +
        "Get it from GuessMap Settings > Agent API > Token."
    );
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function api(method, path, body, { fatal = true } = {}) {
    const url = `${base}${path}`;
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

  function readJsonAsset(relativePath, importUrl) {
    const url = new URL(relativePath, importUrl);
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

  return {
    api,
    printJson,
    ensureHintTypeExists,
    readJsonAsset,
    normalizeRegionRef,
    countryCodeToFlagEmoji,
    countryCodeToDomain,
    uploadAssetFromUrl,
    host,
    port,
  };
}

