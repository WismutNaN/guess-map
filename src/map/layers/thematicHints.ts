import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { HintTypeInfo } from "../../types";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID_PREFIX = "hint-themed-src:";
const LAYER_ID_PREFIX = "hint-themed-lyr:";
const IMAGE_ID_PREFIX = "hint-themed-image:";
const IMAGE_ID_PROPERTY = "icon_image_id";

const THEMATIC_DISPLAY_FAMILIES = new Set<string>(["image", "icon"]);
const EXCLUDED_HINT_CODES = new Set<string>(["flag"]);

const mapsWithImageMissingHandler = new WeakSet<maplibregl.Map>();
const imageLoadsInFlight = new Map<string, Promise<void>>();
const stateByMap = new WeakMap<maplibregl.Map, ThematicHintLayerState>();

export const DEFAULT_THEMATIC_HINT_SIZE_SCALE = 1.2;

const MIN_THEMATIC_HINT_SIZE_SCALE = 0.6;
const MAX_THEMATIC_HINT_SIZE_SCALE = 3.0;
const THEME_BASE_SIZES = {
  zoom2: 0.18,
  zoom4: 0.24,
  zoom7: 0.3,
} as const;

type ThematicFeatureProperties = GeoJSON.GeoJsonProperties & {
  short_value?: string;
  full_value?: string;
  color?: string;
  confidence?: number;
  image_asset_id?: string;
  icon_asset_id?: string;
  icon_image_id?: string;
};

type ThematicFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  ThematicFeatureProperties
>;

type ThematicHintLayerState = {
  hintTypes: HintTypeInfo[];
};

const HINT_OFFSETS: Record<string, [number, number]> = {
  sign: [0, -3.2],
  road_marking: [2.9, -1.8],
  bollard: [-2.9, -1.8],
  pole: [3.1, 0.3],
  script_sample: [-3.1, 0.3],
  car_type: [0, 2.6],
  vegetation: [2.5, 2.2],
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

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = src;
  });
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
    if (!map.hasImage(imageId)) {
      map.addImage(imageId, image);
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

function fallbackOffset(index: number, total: number): [number, number] {
  const steps = Math.max(total, 1);
  const radius = 2.9;
  const angle = -Math.PI / 2 + (index / steps) * Math.PI * 2;
  const x = Number((Math.cos(angle) * radius).toFixed(2));
  const y = Number((Math.sin(angle) * radius).toFixed(2));
  return [x, y];
}

function getHintOffset(code: string, index: number, total: number): [number, number] {
  return HINT_OFFSETS[code] ?? fallbackOffset(index, total);
}

function toTextOffset(iconOffset: [number, number]): [number, number] {
  return [Number((iconOffset[0] * 0.58).toFixed(2)), Number((iconOffset[1] * 0.58).toFixed(2))];
}

async function upsertHintLayer(
  map: maplibregl.Map,
  hintType: HintTypeInfo,
  index: number,
  total: number
) {
  const sourceId = sourceIdForHint(hintType.code);
  const layerId = layerIdForHint(hintType.code);
  const data = await loadHintGeoJson(hintType.code);
  const assetIds = applyIconImageIds(data);

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

  const iconOffset = getHintOffset(hintType.code, index, total);
  const textOffset = toTextOffset(iconOffset);

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "symbol",
      source: sourceId,
      minzoom: 2,
      maxzoom: 9,
      layout: {
        "icon-image": ["get", IMAGE_ID_PROPERTY],
        "icon-size": buildHintSizeExpression(DEFAULT_THEMATIC_HINT_SIZE_SCALE),
        "icon-anchor": "center",
        "icon-offset": iconOffset,
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
        "text-offset": textOffset,
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
  }

  registerLayerGroup(hintType.code, [layerId]);
}

export async function addThematicHintLayers(map: maplibregl.Map) {
  const hintTypes = await loadThematicHintTypes();
  stateByMap.set(map, { hintTypes });

  for (const [index, hintType] of hintTypes.entries()) {
    await upsertHintLayer(map, hintType, index, hintTypes.length);
  }
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

  await upsertHintLayer(map, state.hintTypes[index], index, state.hintTypes.length);
  return true;
}

export function setThematicHintMinConfidence(map: maplibregl.Map, minConfidence: number) {
  const state = stateByMap.get(map);
  if (!state) {
    return;
  }

  const normalized = Math.max(0, Math.min(1, minConfidence));
  for (const hintType of state.hintTypes) {
    const layerId = layerIdForHint(hintType.code);
    if (!map.getLayer(layerId)) {
      continue;
    }

    if (normalized <= 0) {
      map.setFilter(layerId, null);
      continue;
    }

    map.setFilter(layerId, [
      ">=",
      ["coalesce", ["get", "confidence"], 0],
      normalized,
    ]);
  }
}

export function setThematicHintSizeScale(map: maplibregl.Map, scale: number) {
  const state = stateByMap.get(map);
  if (!state) {
    return;
  }

  const expression = buildHintSizeExpression(scale);
  for (const hintType of state.hintTypes) {
    const layerId = layerIdForHint(hintType.code);
    if (!map.getLayer(layerId)) {
      continue;
    }
    map.setLayoutProperty(layerId, "icon-size", expression);
  }
}
