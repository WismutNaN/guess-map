import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { HintTypeInfo } from "../../types";
import { registerLayerGroup } from "../layerManager";
import { applySlotLayout, makeCenteredGridOffsets, setSlotLayers } from "./slots";
import {
  colorForHintCode,
  createHintImageCard,
  createHintTextCard,
  setHintCardImage,
} from "./hintCards";

const SOURCE_ID_PREFIX = "hint-themed-src:";
const LAYER_ID_PREFIX = "hint-themed-lyr:";
const IMAGE_ID_PREFIX = "hint-themed-card:v4:";
const IMAGE_ID_PROPERTY = "icon_image_id";
const LOCAL_SLOT_KEY_PROPERTY = "gm_local_slot_key";
const SLOT_LAYER_SEPARATOR = ":slot:";

const THEMATIC_DISPLAY_FAMILIES = new Set<string>(["image", "icon", "text"]);
const EXCLUDED_HINT_CODES = new Set<string>(["flag", "note"]);

const mapsWithImageMissingHandler = new WeakSet<maplibregl.Map>();
const imageLoadsInFlight = new Map<string, Promise<void>>();
const stateByMap = new WeakMap<maplibregl.Map, ThematicHintLayerState>();
const thematicCardDescriptors = new Map<string, ThematicCardDescriptor>();

export const DEFAULT_THEMATIC_HINT_SIZE_SCALE = 1.2;

const MIN_THEMATIC_HINT_SIZE_SCALE = 0.6;
const MAX_THEMATIC_HINT_SIZE_SCALE = 3.0;
const THEME_BASE_SIZES = {
  zoom2: 0.12,
  zoom4: 0.2,
  zoom6: 0.32,
  zoom8: 0.44,
} as const;
const THEMATIC_CARD_WIDTH = 240;
const THEMATIC_LOCAL_SPACING_BASE = Math.round(THEMATIC_CARD_WIDTH * 0.88);
const THEMATIC_LOCAL_SPACING_MIN = 120;
const THEMATIC_LOCAL_SPACING_MAX = 340;
const REGION_LEVEL_SIZE_FACTOR = [
  "match",
  ["coalesce", ["get", "region_level"], "country"],
  "country",
  1,
  "theme_region",
  0.9,
  "admin1",
  0.82,
  "admin2",
  0.72,
  1,
] as maplibregl.ExpressionSpecification;

type ThematicFeatureProperties = GeoJSON.GeoJsonProperties & {
  region_id?: string;
  region_level?: string;
  short_value?: string;
  full_value?: string;
  color?: string;
  confidence?: number;
  image_asset_id?: string;
  icon_asset_id?: string;
  icon_image_id?: string;
  gm_local_slot_key?: string;
};

type ThematicFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  ThematicFeatureProperties
>;

type ThematicHintLayerState = {
  hintTypes: HintTypeInfo[];
};

interface LocalSlotDefinition {
  key: string;
  offset: [number, number];
  layerId: string;
  rank: number;
}

type ThematicCardDescriptor = {
  imageId: string;
  kind: "asset" | "text";
  hintCode: string;
  hintTitle: string;
  accentColor: string;
  assetId?: string;
  text?: string;
  subtitle?: string;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isThematicHintType(hintType: HintTypeInfo): boolean {
  return (
    hintType.is_active &&
    THEMATIC_DISPLAY_FAMILIES.has(hintType.display_family) &&
    !EXCLUDED_HINT_CODES.has(hintType.code)
  );
}

function sourceIdForHint(code: string): string {
  return `${SOURCE_ID_PREFIX}${code}`;
}

function layerIdForHint(code: string): string {
  return `${LAYER_ID_PREFIX}${code}`;
}

function slotLayerPrefixForHint(code: string): string {
  return `${layerIdForHint(code)}${SLOT_LAYER_SEPARATOR}`;
}

function sanitizeSlotKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function slotLayerIdForHint(code: string, key: string): string {
  return `${slotLayerPrefixForHint(code)}${sanitizeSlotKey(key)}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function imageIdForAsset(hintCode: string, assetId: string): string {
  return `${IMAGE_ID_PREFIX}asset:${hintCode}:${assetId}`;
}

function imageIdForTextCard(hintCode: string, text: string): string {
  return `${IMAGE_ID_PREFIX}text:${hintCode}:${hashString(text).toString(16)}`;
}

function registerThematicCardDescriptor(descriptor: ThematicCardDescriptor) {
  const existing = thematicCardDescriptors.get(descriptor.imageId);
  if (!existing) {
    thematicCardDescriptors.set(descriptor.imageId, descriptor);
    return;
  }

  if (!existing.subtitle && descriptor.subtitle) {
    existing.subtitle = descriptor.subtitle;
  }
}

function clampHintSizeScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THEMATIC_HINT_SIZE_SCALE;
  return Math.max(
    MIN_THEMATIC_HINT_SIZE_SCALE,
    Math.min(MAX_THEMATIC_HINT_SIZE_SCALE, value)
  );
}

function buildHintSizeExpression(scale: number): maplibregl.ExpressionSpecification {
  const clamped = clampHintSizeScale(scale);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2,
    ["*", THEME_BASE_SIZES.zoom2 * clamped, REGION_LEVEL_SIZE_FACTOR],
    4,
    ["*", THEME_BASE_SIZES.zoom4 * clamped, REGION_LEVEL_SIZE_FACTOR],
    6,
    ["*", THEME_BASE_SIZES.zoom6 * clamped, REGION_LEVEL_SIZE_FACTOR],
    8,
    ["*", THEME_BASE_SIZES.zoom8 * clamped, REGION_LEVEL_SIZE_FACTOR],
  ] as maplibregl.ExpressionSpecification;
}

async function loadHintGeoJson(hintTypeCode: string): Promise<ThematicFeatureCollection> {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode,
  });
  return JSON.parse(geojsonStr) as ThematicFeatureCollection;
}

async function loadThematicHintTypes(): Promise<HintTypeInfo[]> {
  const allTypes = await invoke<HintTypeInfo[]>("get_hint_types");
  return allTypes
    .filter(isThematicHintType)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function chooseFeatureAssetId(props: ThematicFeatureProperties): string | null {
  return normalizeText(props.icon_asset_id) ?? normalizeText(props.image_asset_id);
}

function chooseFeatureText(props: ThematicFeatureProperties): string | null {
  const direct =
    normalizeText(props.short_value) ?? normalizeText(props.full_value);
  if (direct) {
    return direct;
  }

  const fallbackKeys = [
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

  for (const key of fallbackKeys) {
    const raw = (props as Record<string, unknown>)[key];
    if (typeof raw === "string") {
      const value = normalizeText(raw);
      if (value) {
        return value;
      }
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw);
    }
  }

  return null;
}

function applyIconImageIds(
  data: ThematicFeatureCollection,
  hintType: HintTypeInfo
): string[] {
  const imageIds = new Set<string>();
  const accentColor = colorForHintCode(hintType.code);
  const tag = truncateText(hintType.title, 28);

  for (const feature of data.features) {
    const props: ThematicFeatureProperties = feature.properties ?? {};
    const assetId = chooseFeatureAssetId(props);
    const textValue = chooseFeatureText(props);
    let imageId: string | null = null;

    if (assetId) {
      imageId = imageIdForAsset(hintType.code, assetId);
      registerThematicCardDescriptor({
        imageId,
        kind: "asset",
        hintCode: hintType.code,
        hintTitle: tag,
        accentColor,
        assetId,
        subtitle: textValue ? truncateText(textValue, 26) : undefined,
      });
    } else if (textValue) {
      imageId = imageIdForTextCard(hintType.code, textValue);
      registerThematicCardDescriptor({
        imageId,
        kind: "text",
        hintCode: hintType.code,
        hintTitle: tag,
        accentColor,
        text: truncateText(textValue, 64),
      });
    }

    if (imageId) {
      props[IMAGE_ID_PROPERTY] = imageId;
      imageIds.add(imageId);
    } else {
      delete props[IMAGE_ID_PROPERTY];
    }

    feature.properties = props;
  }

  return [...imageIds];
}

function getFeatureGroupingKey(
  feature: GeoJSON.Feature<GeoJSON.Geometry, ThematicFeatureProperties>,
  index: number
): string {
  const props = feature.properties ?? {};
  const regionId = normalizeText(props.region_id);
  if (regionId) {
    return `region:${regionId}`;
  }

  const geometry = feature.geometry;
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    const lng = Number(geometry.coordinates[0]);
    const lat = Number(geometry.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return `point:${lng.toFixed(4)}:${lat.toFixed(4)}`;
    }
  }

  return `feature:${index}`;
}

function buildLocalSlotKey(offset: [number, number]): string {
  return `${offset[0]},${offset[1]}`;
}

function regionLevelSpacingFactor(regionLevel: string | null): number {
  switch (regionLevel) {
    case "admin2":
      return 0.72;
    case "admin1":
      return 0.82;
    case "theme_region":
      return 0.9;
    case "country":
    default:
      return 1;
  }
}

function computeAdaptiveLocalSpacing(count: number, regionLevel: string | null): number {
  const featureCount = Math.max(1, count);
  const columns = Math.ceil(Math.sqrt(featureCount));
  const densityFactor = 1 + Math.max(0, columns - 1) * 0.22;
  const regionFactor = regionLevelSpacingFactor(regionLevel);
  const spacing = THEMATIC_LOCAL_SPACING_BASE * densityFactor * regionFactor;
  return Number(
    Math.max(THEMATIC_LOCAL_SPACING_MIN, Math.min(THEMATIC_LOCAL_SPACING_MAX, spacing)).toFixed(2)
  );
}

function slotMinZoomForRank(rank: number): number {
  if (rank <= 0) return 2;
  if (rank <= 2) return 4.2;
  if (rank <= 5) return 5.8;
  return 7;
}

function applyLocalSlotKeys(data: ThematicFeatureCollection): LocalSlotDefinition[] {
  const groups = new Map<
    string,
    Array<GeoJSON.Feature<GeoJSON.Geometry, ThematicFeatureProperties>>
  >();
  const offsetsByKey = new Map<string, [number, number]>();
  const rankByKey = new Map<string, number>();

  for (let i = 0; i < data.features.length; i += 1) {
    const feature = data.features[i];
    const key = getFeatureGroupingKey(feature, i);
    const group = groups.get(key);
    if (group) {
      group.push(feature);
    } else {
      groups.set(key, [feature]);
    }
  }

  for (const groupFeatures of groups.values()) {
    const regionLevel = normalizeText(groupFeatures[0]?.properties?.region_level);
    const spacing = computeAdaptiveLocalSpacing(groupFeatures.length, regionLevel);
    const offsets = makeCenteredGridOffsets(groupFeatures.length, spacing)
      .map((offset) => ({
        offset,
        distance: Math.hypot(offset[0], offset[1]),
      }))
      .sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < groupFeatures.length; i += 1) {
      const feature = groupFeatures[i];
      const props: ThematicFeatureProperties = feature.properties ?? {};
      const offset = offsets[i]?.offset ?? [0, 0];
      const slotKey = buildLocalSlotKey(offset);
      props[LOCAL_SLOT_KEY_PROPERTY] = slotKey;
      feature.properties = props;
      offsetsByKey.set(slotKey, offset);
      const existingRank = rankByKey.get(slotKey);
      if (existingRank === undefined || i < existingRank) {
        rankByKey.set(slotKey, i);
      }
    }
  }

  return [...offsetsByKey.entries()]
    .map(([key, offset]) => ({
      key,
      offset,
      rank: rankByKey.get(key) ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.offset[1] - b.offset[1] || a.offset[0] - b.offset[0])
    .map((entry) => ({
      ...entry,
      layerId: "",
    }));
}

function getSlotLayerIdsForHint(map: maplibregl.Map, hintTypeCode: string): string[] {
  const prefix = slotLayerPrefixForHint(hintTypeCode);
  const style = map.getStyle();
  if (!style?.layers) {
    return [];
  }
  return style.layers
    .map((layer) => layer.id)
    .filter((id) => id.startsWith(prefix));
}

function makeSlotFilter(localSlotKey: string): maplibregl.FilterSpecification {
  return ["==", ["get", LOCAL_SLOT_KEY_PROPERTY], localSlotKey] as maplibregl.FilterSpecification;
}

function getLocalSlotKeyByLayerId(map: maplibregl.Map, layerId: string): string | null {
  const style = map.getStyle();
  const styleLayer = style?.layers?.find((layer) => layer.id === layerId);
  const metadata = (styleLayer?.metadata ?? {}) as Record<string, unknown>;
  return normalizeText(metadata[LOCAL_SLOT_KEY_PROPERTY]);
}

function upsertSlotLayer(
  map: maplibregl.Map,
  sourceId: string,
  layerId: string,
  localSlotKey: string,
  minzoom: number
) {
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      minzoom,
      maxzoom: 9,
      metadata: {
        [LOCAL_SLOT_KEY_PROPERTY]: localSlotKey,
      },
      filter: makeSlotFilter(localSlotKey),
      layout: {
        "icon-image": ["get", IMAGE_ID_PROPERTY],
        "icon-size": buildHintSizeExpression(DEFAULT_THEMATIC_HINT_SIZE_SCALE),
        "icon-anchor": "center",
        "icon-allow-overlap": false,
        "icon-ignore-placement": false,
        "icon-padding": 6,
        "icon-optional": true,
        "text-field": [
          "case",
          ["has", IMAGE_ID_PROPERTY],
          "",
          ["coalesce", ["get", "short_value"], ["get", "full_value"], ""],
        ],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          9,
          6,
          11,
        ],
        "text-font": ["Open Sans Regular"],
        "text-anchor": "top",
        "text-offset": [0, 1.15],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": true,
        "symbol-sort-key": ["coalesce", ["get", "confidence"], 0],
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#1b2644"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.1,
      },
    });
  } else {
    map.setFilter(layerId, makeSlotFilter(localSlotKey));
    map.setLayerZoomRange(layerId, minzoom, 9);
  }
}

function syncSlotLayers(
  map: maplibregl.Map,
  hintTypeCode: string,
  sourceId: string,
  localSlots: LocalSlotDefinition[]
): LocalSlotDefinition[] {
  const withLayerIds = localSlots.map((slot) => ({
    ...slot,
    layerId: slotLayerIdForHint(hintTypeCode, slot.key),
  }));
  const desiredLayerIds = new Set(withLayerIds.map((slot) => slot.layerId));
  const existingLayerIds = getSlotLayerIdsForHint(map, hintTypeCode);

  for (const layerId of existingLayerIds) {
    if (!desiredLayerIds.has(layerId) && map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  for (const slot of withLayerIds) {
    upsertSlotLayer(map, sourceId, slot.layerId, slot.key, slotMinZoomForRank(slot.rank));
  }

  return withLayerIds;
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = src;
  });
}

async function ensureThematicImage(map: maplibregl.Map, imageId: string): Promise<void> {
  if (map.hasImage(imageId)) {
    return;
  }

  const descriptor = thematicCardDescriptors.get(imageId);
  if (!descriptor) {
    return;
  }

  const existingLoad = imageLoadsInFlight.get(imageId);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    if (descriptor.kind === "asset") {
      const dataUrl = await invoke<string>("get_asset_data_url", {
        assetId: descriptor.assetId,
      });
      const image = await loadImageElement(dataUrl);
      const imageForMap = createHintImageCard(image, {
        hintCode: descriptor.hintCode,
        tag: descriptor.hintTitle,
        subtitle: descriptor.subtitle,
      });
      setHintCardImage(map, imageId, imageForMap);
      return;
    }

    const textCard = createHintTextCard({
      hintCode: descriptor.hintCode,
      tag: descriptor.hintTitle,
      text: descriptor.text ?? "",
    });
    setHintCardImage(map, imageId, textCard);
  })()
    .catch((error) => {
      console.warn(`Failed to load themed card image ${imageId}:`, error);
    })
    .finally(() => {
      imageLoadsInFlight.delete(imageId);
    });

  imageLoadsInFlight.set(imageId, loadPromise);
  return loadPromise;
}

function bindStyleImageMissingHandler(map: maplibregl.Map) {
  if (mapsWithImageMissingHandler.has(map)) {
    return;
  }

  map.on("styleimagemissing", (event) => {
    const imageId = normalizeText((event as { id?: unknown }).id);
    if (!imageId) return;
    if (!imageId.startsWith(IMAGE_ID_PREFIX)) return;
    void ensureThematicImage(map, imageId);
  });

  mapsWithImageMissingHandler.add(map);
}

function preloadThematicImages(map: maplibregl.Map, imageIds: string[]) {
  for (const imageId of imageIds) {
    void ensureThematicImage(map, imageId);
  }
}

async function upsertHintLayer(map: maplibregl.Map, hintType: HintTypeInfo) {
  const sourceId = sourceIdForHint(hintType.code);
  const data = await loadHintGeoJson(hintType.code);
  const imageIds = applyIconImageIds(data, hintType);
  const localSlots = applyLocalSlotKeys(data);

  bindStyleImageMissingHandler(map);
  preloadThematicImages(map, imageIds);

  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    map.addSource(sourceId, {
      type: "geojson",
      data,
    });
  } else {
    source.setData(data);
  }

  const slotLayers = syncSlotLayers(map, hintType.code, sourceId, localSlots);
  setSlotLayers(
    map,
    hintType.code,
    slotLayers.map((slot) => ({
      layerId: slot.layerId,
      localOffset: slot.offset,
    }))
  );
  registerLayerGroup(
    hintType.code,
    slotLayers.map((slot) => slot.layerId)
  );
}

export async function addThematicHintLayers(map: maplibregl.Map) {
  const hintTypes = await loadThematicHintTypes();
  stateByMap.set(map, { hintTypes });

  for (const hintType of hintTypes) {
    await upsertHintLayer(map, hintType);
  }
  applySlotLayout(map);
}

export async function refreshThematicHintLayer(
  map: maplibregl.Map,
  hintTypeCode: string
): Promise<boolean> {
  let state = stateByMap.get(map);
  if (!state) {
    await addThematicHintLayers(map);
    state = stateByMap.get(map);
  }

  if (!state) {
    return false;
  }

  const index = state.hintTypes.findIndex((hintType) => hintType.code === hintTypeCode);
  if (index < 0) {
    return false;
  }

  await upsertHintLayer(map, state.hintTypes[index]);
  applySlotLayout(map);
  return true;
}

export function setThematicHintMinConfidence(map: maplibregl.Map, minConfidence: number) {
  const state = stateByMap.get(map);
  if (!state) {
    return;
  }

  const normalized = Math.max(0, Math.min(1, minConfidence));
  for (const hintType of state.hintTypes) {
    for (const layerId of getSlotLayerIdsForHint(map, hintType.code)) {
      if (!map.getLayer(layerId)) {
        continue;
      }

      const localSlotKey = getLocalSlotKeyByLayerId(map, layerId);
      if (!localSlotKey) {
        continue;
      }

      const slotFilter = makeSlotFilter(localSlotKey);

      if (normalized <= 0) {
        map.setFilter(layerId, slotFilter);
        continue;
      }

      map.setFilter(layerId, [
        "all",
        slotFilter,
        [">=", ["coalesce", ["get", "confidence"], 0], normalized],
      ] as maplibregl.FilterSpecification);
    }
  }
}

export function setThematicHintSizeScale(map: maplibregl.Map, scale: number) {
  const state = stateByMap.get(map);
  if (!state) {
    return;
  }

  const expression = buildHintSizeExpression(scale);
  for (const hintType of state.hintTypes) {
    for (const layerId of getSlotLayerIdsForHint(map, hintType.code)) {
      if (!map.getLayer(layerId)) {
        continue;
      }
      map.setLayoutProperty(layerId, "icon-size", expression);
    }
  }
}
