/**
 * Unified Hint Grid Layer
 *
 * Replaces the separate flags.ts + thematicHints.ts + slots.ts pipeline with
 * a single GeoJSON source that merges ALL grid-eligible hint types (including
 * flags) and positions them in a per-region centered grid.
 *
 * Key improvements over the old system:
 *  - One source, one layer → no cross-layer collision issues
 *  - Per-region grid offsets → cards never overflow into neighbouring countries
 *  - Flags are part of the grid → no separate slot coordination needed
 *  - Toggling a type re-compacts the grid (no gaps)
 */

import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import type { HintTypeInfo } from "../../types";
import { registerLayerGroup } from "../layerManager";
import {
  colorForHintCode,
  createHintImageCard,
  createHintTextCard,
  setHintCardImage,
} from "./hintCards";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_ID = "hint-grid";
export const LAYER_ID = "hint-grid";
const IMAGE_PREFIX = "hg:";

/** Horizontal spacing between card centres in icon-offset units. */
const H_SPACING = 255;
/** Vertical spacing between card centres in icon-offset units. */
const V_SPACING = 195;

// Icon size — interpolated by zoom, multiplied by user scale + region level
export const DEFAULT_GRID_SIZE_SCALE = 1.4;
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 3.0;

const SIZE_STOPS: Record<string, number> = {
  z2: 0.10,
  z3: 0.15,
  z4: 0.22,
  z5: 0.30,
  z6: 0.40,
  z7: 0.52,
  z8: 0.65,
};

const REGION_LEVEL_SIZE: maplibregl.ExpressionSpecification = [
  "match",
  ["coalesce", ["get", "region_level"], "country"],
  "country",
  1,
  "theme_region",
  0.92,
  "admin1",
  0.82,
  "admin2",
  0.72,
  1,
];

/** Lower number = earlier (top-left) position in the per-region grid. */
const TYPE_PRIORITY: Record<string, number> = {
  flag: 0,
  phone_hint: 10,
  country_domain: 15,
  camera_gens_tag: 18,
  script_sample: 20,
  sign: 40,
  road_marking: 50,
  pole: 60,
  bollard: 70,
  vegetation: 80,
  camera_meta: 90,
};

/** Display families that belong in the grid. */
const GRID_FAMILIES = new Set(["image", "icon", "text"]);
/** Hint types managed by other specialised layers. */
const EXCLUDED_CODES = new Set([
  "note",
  "driving_side",
  "coverage",
  "highway",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = GeoJSON.GeoJsonProperties & {
  region_id?: string;
  region_level?: string;
  hint_type_code?: string;
  short_value?: string;
  full_value?: string;
  icon_asset_id?: string;
  image_asset_id?: string;
  country_code?: string;
  confidence?: number;
  color?: string;
  icon_image_id?: string;
  grid_offset?: [number, number];
};

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Props>;

interface CardDescriptor {
  imageId: string;
  kind: "asset" | "text";
  hintCode: string;
  tag: string;
  assetId?: string;
  text?: string;
  subtitle?: string;
}

interface GridState {
  types: Map<string, HintTypeInfo>;
  rawByType: Map<string, FC>;
  hiddenCodes: Set<string>;
  sizeScale: number;
}

// ---------------------------------------------------------------------------
// Module-level registries
// ---------------------------------------------------------------------------

const stateByMap = new WeakMap<maplibregl.Map, GridState>();
const cardDescriptors = new Map<string, CardDescriptor>();
const loadsInFlight = new Map<string, Promise<void>>();
const handlerBound = new WeakSet<maplibregl.Map>();

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function norm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function trunc(v: string, max: number): string {
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

function hashStr(v: string): number {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) {
    h ^= v.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isGridEligible(ht: HintTypeInfo): boolean {
  return (
    ht.is_active &&
    GRID_FAMILIES.has(ht.display_family) &&
    !EXCLUDED_CODES.has(ht.code)
  );
}

function typePriority(code: string): number {
  return TYPE_PRIORITY[code] ?? 50;
}

// ---------------------------------------------------------------------------
// Image IDs
// ---------------------------------------------------------------------------

function imgIdForAsset(code: string, assetId: string): string {
  return `${IMAGE_PREFIX}a:${code}:${assetId}`;
}

function imgIdForText(code: string, text: string): string {
  return `${IMAGE_PREFIX}t:${code}:${hashStr(text).toString(16)}`;
}

// ---------------------------------------------------------------------------
// Feature → card descriptor
// ---------------------------------------------------------------------------

function chooseAssetId(p: Props): string | null {
  return norm(p.icon_asset_id) ?? norm(p.image_asset_id);
}

function chooseText(p: Props): string | null {
  const direct = norm(p.short_value) ?? norm(p.full_value);
  if (direct) return direct;
  const keys = [
    "prefix",
    "format",
    "generation",
    "script_name",
    "route_number",
    "brand",
    "model",
    "biome",
    "material",
    "sign_type",
  ];
  for (const k of keys) {
    const raw = (p as Record<string, unknown>)[k];
    if (typeof raw === "string") {
      const v = norm(raw);
      if (v) return v;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw);
    }
  }
  return null;
}

function applyImageIds(data: FC, ht: HintTypeInfo): void {
  const tag = trunc(ht.title, 22);
  for (const f of data.features) {
    const p: Props = f.properties ?? {};
    p.hint_type_code = ht.code;
    const assetId = chooseAssetId(p);
    const textVal = chooseText(p);
    let imageId: string | null = null;

    if (assetId) {
      imageId = imgIdForAsset(ht.code, assetId);
      const existing = cardDescriptors.get(imageId);
      if (!existing) {
        cardDescriptors.set(imageId, {
          imageId,
          kind: "asset",
          hintCode: ht.code,
          tag,
          assetId,
          subtitle: textVal ? trunc(textVal, 26) : undefined,
        });
      }
    } else if (textVal) {
      imageId = imgIdForText(ht.code, textVal);
      if (!cardDescriptors.has(imageId)) {
        cardDescriptors.set(imageId, {
          imageId,
          kind: "text",
          hintCode: ht.code,
          tag,
          text: trunc(textVal, 64),
        });
      }
    }

    p.icon_image_id = imageId ?? undefined;
    f.properties = p;
  }
}

// ---------------------------------------------------------------------------
// Per-region grid layout
// ---------------------------------------------------------------------------

/**
 * Groups features by anchor coordinates (rounded to ~2 km).
 * This merges regions whose anchors overlap (e.g. Israel + Palestine)
 * into one grid so their cards don't stack on top of each other.
 */
function regionKey(
  f: GeoJSON.Feature<GeoJSON.Geometry, Props>,
  idx: number,
): string {
  const g = f.geometry;
  if (g?.type === "Point" && Array.isArray(g.coordinates)) {
    const lng = Number(g.coordinates[0]);
    const lat = Number(g.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      // Round to 0.02° (~2 km) to catch near-duplicate anchors
      const rlng = Math.round(lng * 50);
      const rlat = Math.round(lat * 50);
      return `${rlng}:${rlat}`;
    }
  }
  const rid = norm(f.properties?.region_id);
  if (rid) return `r:${rid}`;
  return `f:${idx}`;
}

function makeGridOffsets(count: number): Array<[number, number]> {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0]];

  // For small counts use a single row; for larger counts use a balanced grid
  const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const sx = -((cols - 1) * H_SPACING) / 2;
  const sy = -((rows - 1) * V_SPACING) / 2;
  const out: Array<[number, number]> = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push([
      Math.round(sx + col * H_SPACING),
      Math.round(sy + row * V_SPACING),
    ]);
  }
  return out;
}

function assignGridOffsets(
  features: GeoJSON.Feature<GeoJSON.Geometry, Props>[],
): void {
  // Group by region
  const groups = new Map<
    string,
    GeoJSON.Feature<GeoJSON.Geometry, Props>[]
  >();
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const key = regionKey(f, i);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(f);
  }

  // Sort each group by type priority, then assign centred grid offsets
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        typePriority(a.properties?.hint_type_code ?? "") -
        typePriority(b.properties?.hint_type_code ?? ""),
    );
    const offsets = makeGridOffsets(group.length);
    for (let i = 0; i < group.length; i++) {
      const p: Props = group[i].properties ?? {};
      p.grid_offset = offsets[i] ?? [0, 0];
      group[i].properties = p;
    }
  }
}

// ---------------------------------------------------------------------------
// Lazy image loading
// ---------------------------------------------------------------------------

async function loadImgEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

async function ensureCardImage(
  map: maplibregl.Map,
  imageId: string,
): Promise<void> {
  if (map.hasImage(imageId)) return;
  const desc = cardDescriptors.get(imageId);
  if (!desc) return;
  const existing = loadsInFlight.get(imageId);
  if (existing) return existing;

  const promise = (async () => {
    if (desc.kind === "asset" && desc.assetId) {
      const dataUrl = await invoke<string>("get_asset_data_url", {
        assetId: desc.assetId,
      });
      const img = await loadImgEl(dataUrl);
      setHintCardImage(
        map,
        imageId,
        createHintImageCard(img, {
          hintCode: desc.hintCode,
          tag: desc.tag,
          subtitle: desc.subtitle,
        }),
      );
    } else {
      setHintCardImage(
        map,
        imageId,
        createHintTextCard({
          hintCode: desc.hintCode,
          tag: desc.tag,
          text: desc.text ?? "",
        }),
      );
    }
  })()
    .catch((e) => console.warn(`[HintGrid] load ${imageId}:`, e))
    .finally(() => loadsInFlight.delete(imageId));

  loadsInFlight.set(imageId, promise);
  return promise;
}

function bindMissingHandler(map: maplibregl.Map) {
  if (handlerBound.has(map)) return;
  map.on("styleimagemissing", (event) => {
    const id = norm((event as { id?: unknown }).id);
    if (id?.startsWith(IMAGE_PREFIX)) void ensureCardImage(map, id);
  });
  handlerBound.add(map);
}

// ---------------------------------------------------------------------------
// Size expression
// ---------------------------------------------------------------------------

function clampScale(s: number): number {
  if (!Number.isFinite(s)) return DEFAULT_GRID_SIZE_SCALE;
  return Math.max(MIN_SIZE_SCALE, Math.min(MAX_SIZE_SCALE, s));
}

function buildSizeExpr(
  scale: number,
): maplibregl.ExpressionSpecification {
  const s = clampScale(scale);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2,
    ["*", SIZE_STOPS.z2 * s, REGION_LEVEL_SIZE],
    3,
    ["*", SIZE_STOPS.z3 * s, REGION_LEVEL_SIZE],
    4,
    ["*", SIZE_STOPS.z4 * s, REGION_LEVEL_SIZE],
    5,
    ["*", SIZE_STOPS.z5 * s, REGION_LEVEL_SIZE],
    6,
    ["*", SIZE_STOPS.z6 * s, REGION_LEVEL_SIZE],
    7,
    ["*", SIZE_STOPS.z7 * s, REGION_LEVEL_SIZE],
    8,
    ["*", SIZE_STOPS.z8 * s, REGION_LEVEL_SIZE],
  ] as maplibregl.ExpressionSpecification;
}

// ---------------------------------------------------------------------------
// Merged data builder
// ---------------------------------------------------------------------------

function buildMergedData(state: GridState): FC {
  const features: GeoJSON.Feature<GeoJSON.Geometry, Props>[] = [];
  for (const [code, data] of state.rawByType) {
    if (state.hiddenCodes.has(code)) continue;
    // Clone features so originals aren't mutated on re-layout
    for (const f of data.features) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { ...(f.properties ?? {}) },
      });
    }
  }
  assignGridOffsets(features);
  return { type: "FeatureCollection", features };
}

function preloadImages(map: maplibregl.Map, fc: FC) {
  for (const f of fc.features) {
    const id = norm(f.properties?.icon_image_id);
    if (id) void ensureCardImage(map, id);
  }
}

// ---------------------------------------------------------------------------
// GeoJSON loader
// ---------------------------------------------------------------------------

async function loadHintGeoJson(code: string): Promise<FC> {
  const str = await invoke<string>("compile_hint_layer", {
    hintTypeCode: code,
  });
  return JSON.parse(str) as FC;
}

// ---------------------------------------------------------------------------
// Click popup — enlarged image + details
// ---------------------------------------------------------------------------

const popupByMap = new WeakMap<maplibregl.Map, maplibregl.Popup>();
const clickBound = new WeakSet<maplibregl.Map>();

function closePopup(map: maplibregl.Map) {
  const popup = popupByMap.get(map);
  if (popup) {
    popup.remove();
    popupByMap.delete(map);
  }
}

function toPopupLngLat(
  feature: maplibregl.MapGeoJSONFeature,
  fallback: maplibregl.LngLat,
): maplibregl.LngLatLike {
  const geom = feature.geometry;
  if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
    const [lng, lat] = geom.coordinates;
    if (typeof lng === "number" && typeof lat === "number") {
      return [lng, lat];
    }
  }
  return [fallback.lng, fallback.lat];
}

function buildPopupContent(
  props: Record<string, unknown>,
  state: GridState,
): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "hint-image-popup";

  const hintCode = String(props.hint_type_code ?? "");
  const ht = state.types.get(hintCode);
  const accent = colorForHintCode(hintCode);

  // Header: coloured badge + title
  const header = document.createElement("div");
  header.className = "hint-grid-popup-header";

  const badge = document.createElement("span");
  badge.className = "hint-grid-popup-badge";
  badge.style.background = accent;
  badge.textContent = ht?.title ?? hintCode.replace(/_/g, " ");
  header.appendChild(badge);

  const regionName =
    norm(props.region_name as string) ??
    norm(props.country_code as string);
  if (regionName) {
    const region = document.createElement("span");
    region.className = "hint-grid-popup-region";
    region.textContent = regionName;
    header.appendChild(region);
  }
  root.appendChild(header);

  // Value text
  const shortVal = norm(props.short_value as string);
  const fullVal = norm(props.full_value as string);
  if (shortVal || fullVal) {
    const val = document.createElement("div");
    val.className = "hint-grid-popup-value";
    val.textContent = shortVal ?? fullVal ?? "";
    root.appendChild(val);
    if (shortVal && fullVal && shortVal !== fullVal) {
      const desc = document.createElement("div");
      desc.className = "hint-image-popup-body";
      desc.textContent = fullVal;
      root.appendChild(desc);
    }
  }

  // Image placeholder (filled async)
  const assetId =
    norm(props.image_asset_id as string) ??
    norm(props.icon_asset_id as string);
  if (assetId) {
    const figure = document.createElement("div");
    figure.className = "hint-image-popup-figure";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = shortVal ?? "Hint image";
    figure.appendChild(img);
    root.appendChild(figure);

    // Load full-size image
    void invoke<string>("get_asset_data_url", { assetId })
      .then((url) => {
        img.src = url;
      })
      .catch((e) => console.warn("[HintGrid] popup image:", e));
  }

  // Source note
  const sourceNote = norm(props.source_note as string);
  if (sourceNote) {
    const meta = document.createElement("div");
    meta.className = "hint-image-popup-meta";
    meta.textContent = sourceNote;
    root.appendChild(meta);
  }

  return root;
}

function bindClickPopup(map: maplibregl.Map) {
  if (clickBound.has(map)) return;

  map.on("mouseenter", LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", LAYER_ID, (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    if (event.originalEvent instanceof MouseEvent) {
      event.originalEvent.stopPropagation();
    }

    const state = stateByMap.get(map);
    if (!state) return;

    const props = feature.properties ?? {};
    const lngLat = toPopupLngLat(feature, event.lngLat);

    closePopup(map);

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "420px",
      className: "hint-image-popup-shell",
    })
      .setLngLat(lngLat)
      .setDOMContent(buildPopupContent(props, state))
      .addTo(map);

    popupByMap.set(map, popup);
  });

  clickBound.add(map);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bootstrap: load all grid-eligible hint types and create the unified layer.
 */
export async function addHintGridLayer(
  map: maplibregl.Map,
): Promise<void> {
  const allTypes = await invoke<HintTypeInfo[]>("get_hint_types");
  const gridTypes = allTypes
    .filter(isGridEligible)
    .sort((a, b) => a.sort_order - b.sort_order);

  const types = new Map<string, HintTypeInfo>();
  const rawByType = new Map<string, FC>();

  for (const ht of gridTypes) {
    types.set(ht.code, ht);
    const data = await loadHintGeoJson(ht.code);
    applyImageIds(data, ht);
    rawByType.set(ht.code, data);
  }

  const state: GridState = {
    types,
    rawByType,
    hiddenCodes: new Set(),
    sizeScale: DEFAULT_GRID_SIZE_SCALE,
  };
  stateByMap.set(map, state);

  bindMissingHandler(map);
  const merged = buildMergedData(state);
  preloadImages(map, merged);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: merged });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      minzoom: 2,
      maxzoom: 10,
      layout: {
        "icon-image": ["get", "icon_image_id"],
        "icon-offset": [
          "get",
          "grid_offset",
        ] as unknown as maplibregl.ExpressionSpecification,
        "icon-size": buildSizeExpr(DEFAULT_GRID_SIZE_SCALE),
        "icon-anchor": "center",
        "icon-allow-overlap": false,
        "icon-ignore-placement": false,
        "icon-padding": 2,
        "icon-optional": true,
        "text-field": "",
        "text-optional": true,
        "symbol-sort-key": [
          "coalesce",
          ["get", "confidence"],
          0,
        ] as maplibregl.ExpressionSpecification,
      },
      paint: {
        "text-color": "#1b2439",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });
  }

  // Register each type in layerManager with EMPTY layer list —
  // actual visibility is handled by re-filtering source data.
  for (const code of types.keys()) {
    registerLayerGroup(code, []);
  }

  // Click popup for enlarged view
  bindClickPopup(map);
}

/**
 * Toggle visibility of a specific hint type in the grid.
 * Re-compacts the grid layout (no gaps where hidden types were).
 */
export function setHintGridTypeVisibility(
  map: maplibregl.Map,
  code: string,
  visible: boolean,
): void {
  const state = stateByMap.get(map);
  if (!state || !state.types.has(code)) return;

  if (visible) {
    state.hiddenCodes.delete(code);
  } else {
    state.hiddenCodes.add(code);
  }

  const merged = buildMergedData(state);
  const source = map.getSource(SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (source) source.setData(merged);
}

/** Returns true if the given hint type code is managed by the grid. */
export function isHintGridCode(
  map: maplibregl.Map,
  code: string,
): boolean {
  const state = stateByMap.get(map);
  return state?.types.has(code) ?? false;
}

/** Refresh one hint type after data changes. */
export async function refreshHintGridType(
  map: maplibregl.Map,
  code: string,
): Promise<boolean> {
  const state = stateByMap.get(map);
  if (!state) return false;

  // If the type isn't known yet, reload all types
  if (!state.types.has(code)) {
    const allTypes = await invoke<HintTypeInfo[]>("get_hint_types");
    const ht = allTypes.find((t) => t.code === code);
    if (!ht || !isGridEligible(ht)) return false;
    state.types.set(code, ht);
  }

  const ht = state.types.get(code)!;
  const data = await loadHintGeoJson(code);
  applyImageIds(data, ht);
  state.rawByType.set(code, data);

  const merged = buildMergedData(state);
  preloadImages(map, merged);

  const source = map.getSource(SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (source) source.setData(merged);
  return true;
}

/** Refresh all grid types. */
export async function refreshHintGrid(
  map: maplibregl.Map,
): Promise<void> {
  const state = stateByMap.get(map);
  if (!state) {
    await addHintGridLayer(map);
    return;
  }

  for (const [code, ht] of state.types) {
    const data = await loadHintGeoJson(code);
    applyImageIds(data, ht);
    state.rawByType.set(code, data);
  }

  const merged = buildMergedData(state);
  preloadImages(map, merged);

  const source = map.getSource(SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (source) source.setData(merged);
}

/** Adjust the rendered size of grid cards. */
export function setHintGridSizeScale(
  map: maplibregl.Map,
  scale: number,
): void {
  const state = stateByMap.get(map);
  if (state) state.sizeScale = clampScale(scale);
  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(
      LAYER_ID,
      "icon-size",
      buildSizeExpr(clampScale(scale)),
    );
  }
}

/** Apply a minimum-confidence filter. */
export function setHintGridMinConfidence(
  map: maplibregl.Map,
  minConfidence: number,
): void {
  if (!map.getLayer(LAYER_ID)) return;
  const n = Math.max(0, Math.min(1, minConfidence));
  if (n <= 0) {
    map.setFilter(LAYER_ID, null);
  } else {
    map.setFilter(LAYER_ID, [
      ">=",
      ["coalesce", ["get", "confidence"], 0],
      n,
    ] as maplibregl.FilterSpecification);
  }
}
