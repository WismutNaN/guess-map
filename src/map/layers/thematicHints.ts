import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { HintTypeInfo } from "../../types";
import { registerLayerGroup } from "../layerManager";
import { applySlotLayout, makeCenteredGridOffsets, setSlotLayers } from "./slots";

const SOURCE_ID_PREFIX = "hint-themed-src:";
const LAYER_ID_PREFIX = "hint-themed-lyr:";
const IMAGE_ID_PREFIX = "hint-themed-image:v3:";
const IMAGE_ID_PROPERTY = "icon_image_id";
const LOCAL_SLOT_KEY_PROPERTY = "gm_local_slot_key";
const SLOT_LAYER_SEPARATOR = ":slot:";

const THEMATIC_DISPLAY_FAMILIES = new Set<string>(["image", "icon"]);
const EXCLUDED_HINT_CODES = new Set<string>(["flag"]);

const mapsWithImageMissingHandler = new WeakSet<maplibregl.Map>();
const imageLoadsInFlight = new Map<string, Promise<void>>();
const stateByMap = new WeakMap<maplibregl.Map, ThematicHintLayerState>();

export const DEFAULT_THEMATIC_HINT_SIZE_SCALE = 1.2;

const MIN_THEMATIC_HINT_SIZE_SCALE = 0.6;
const MAX_THEMATIC_HINT_SIZE_SCALE = 3.0;
const THEME_BASE_SIZES = {
  zoom2: 0.22,
  zoom4: 0.28,
  zoom7: 0.34,
} as const;
const THEMATIC_THUMBNAIL_MAX_WIDTH = 320;
const THEMATIC_THUMBNAIL_MAX_HEIGHT = 200;
const THEMATIC_LOCAL_SPACING_BASE = Math.round(THEMATIC_THUMBNAIL_MAX_WIDTH * 0.92);
const THEMATIC_LOCAL_SPACING_MIN = 220;
const THEMATIC_LOCAL_SPACING_MAX = 420;

type ThematicFeatureProperties = GeoJSON.GeoJsonProperties & {
  region_id?: string;
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
}

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

function imageIdForAsset(assetId: string): string {
  return `${IMAGE_ID_PREFIX}${assetId}`;
}

function assetIdFromImageId(imageId: string): string | null {
  if (!imageId.startsWith(IMAGE_ID_PREFIX)) return null;
  return normalizeText(imageId.slice(IMAGE_ID_PREFIX.length));
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
    THEME_BASE_SIZES.zoom2 * clamped,
    4,
    THEME_BASE_SIZES.zoom4 * clamped,
    7,
    THEME_BASE_SIZES.zoom7 * clamped,
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

function applyIconImageIds(data: ThematicFeatureCollection): string[] {
  const assetIds = new Set<string>();

  for (const feature of data.features) {
    const props: ThematicFeatureProperties = feature.properties ?? {};
    const assetId = chooseFeatureAssetId(props);

    if (assetId) {
      props[IMAGE_ID_PROPERTY] = imageIdForAsset(assetId);
      assetIds.add(assetId);
    } else {
      delete props[IMAGE_ID_PROPERTY];
    }

    feature.properties = props;
  }

  return [...assetIds];
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

function computeAdaptiveLocalSpacing(count: number): number {
  const featureCount = Math.max(1, count);
  const columns = Math.ceil(Math.sqrt(featureCount));
  const densityFactor = 1 + Math.max(0, columns - 1) * 0.22;
  const spacing = THEMATIC_LOCAL_SPACING_BASE * densityFactor;
  return Number(
    Math.max(THEMATIC_LOCAL_SPACING_MIN, Math.min(THEMATIC_LOCAL_SPACING_MAX, spacing)).toFixed(2)
  );
}

function applyLocalSlotKeys(data: ThematicFeatureCollection): LocalSlotDefinition[] {
  const groups = new Map<
    string,
    Array<GeoJSON.Feature<GeoJSON.Geometry, ThematicFeatureProperties>>
  >();
  const offsetsByKey = new Map<string, [number, number]>();

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
    const spacing = computeAdaptiveLocalSpacing(groupFeatures.length);
    const offsets = makeCenteredGridOffsets(groupFeatures.length, spacing);

    for (let i = 0; i < groupFeatures.length; i += 1) {
      const feature = groupFeatures[i];
      const props: ThematicFeatureProperties = feature.properties ?? {};
      const offset = offsets[i] ?? [0, 0];
      const slotKey = buildLocalSlotKey(offset);
      props[LOCAL_SLOT_KEY_PROPERTY] = slotKey;
      feature.properties = props;
      offsetsByKey.set(slotKey, offset);
    }
  }

  return [...offsetsByKey.entries()]
    .map(([key, offset]) => ({ key, offset }))
    .sort((a, b) => a.offset[1] - b.offset[1] || a.offset[0] - b.offset[0])
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
  localSlotKey: string
) {
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      minzoom: 2,
      maxzoom: 9,
      metadata: {
        [LOCAL_SLOT_KEY_PROPERTY]: localSlotKey,
      },
      filter: makeSlotFilter(localSlotKey),
      layout: {
        "icon-image": ["get", IMAGE_ID_PROPERTY],
        "icon-size": buildHintSizeExpression(DEFAULT_THEMATIC_HINT_SIZE_SCALE),
        "icon-anchor": "center",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
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
    upsertSlotLayer(map, sourceId, slot.layerId, slot.key);
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

function createThumbnailImageData(
  source: HTMLImageElement,
  maxWidth: number,
  maxHeight: number
): ImageData | HTMLImageElement {
  const naturalWidth = source.naturalWidth || source.width;
  const naturalHeight = source.naturalHeight || source.height;

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return source;
  }

  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  if (scale >= 0.999) {
    return source;
  }

  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

async function ensureThematicImage(map: maplibregl.Map, assetId: string): Promise<void> {
  const imageId = imageIdForAsset(assetId);
  if (map.hasImage(imageId)) {
    return;
  }

  const existingLoad = imageLoadsInFlight.get(imageId);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    const dataUrl = await invoke<string>("get_asset_data_url", { assetId });
    const image = await loadImageElement(dataUrl);
    const thumbnail = createThumbnailImageData(
      image,
      THEMATIC_THUMBNAIL_MAX_WIDTH,
      THEMATIC_THUMBNAIL_MAX_HEIGHT
    );
    if (!map.hasImage(imageId)) {
      map.addImage(imageId, thumbnail);
    }
  })()
    .catch((error) => {
      console.warn(`Failed to load themed icon for asset ${assetId}:`, error);
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

    const assetId = assetIdFromImageId(imageId);
    if (!assetId) return;

    void ensureThematicImage(map, assetId);
  });

  mapsWithImageMissingHandler.add(map);
}

function preloadThematicImages(map: maplibregl.Map, assetIds: string[]) {
  for (const assetId of assetIds) {
    void ensureThematicImage(map, assetId);
  }
}

async function upsertHintLayer(map: maplibregl.Map, hintType: HintTypeInfo) {
  const sourceId = sourceIdForHint(hintType.code);
  const data = await loadHintGeoJson(hintType.code);
  const assetIds = applyIconImageIds(data);
  const localSlots = applyLocalSlotKeys(data);

  bindStyleImageMissingHandler(map);
  preloadThematicImages(map, assetIds);

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
