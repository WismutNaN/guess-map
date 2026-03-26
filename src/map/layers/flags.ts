import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "hint-flags";
const LAYER_ID = "hint-flags";
const IMAGE_ID_PREFIX = "flag-icon:";
const IMAGE_ID_PROPERTY = "icon_image_id";
export const DEFAULT_FLAG_SIZE_SCALE = 1.75;
const MIN_FLAG_SIZE_SCALE = 0.5;
const MAX_FLAG_SIZE_SCALE = 3.0;
const FLAG_BASE_SIZES = {
  zoom2: 0.07,
  zoom4: 0.1,
  zoom7: 0.14,
} as const;

type FlagProperties = GeoJSON.GeoJsonProperties & {
  icon_asset_id?: string;
  icon_image_id?: string;
  short_value?: string;
  country_code?: string;
};

type FlagFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, FlagProperties>;

const mapsWithMissingImageHandler = new WeakSet<maplibregl.Map>();
const flagImageLoadsInFlight = new Map<string, Promise<void>>();

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampFlagSizeScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FLAG_SIZE_SCALE;
  return Math.max(MIN_FLAG_SIZE_SCALE, Math.min(MAX_FLAG_SIZE_SCALE, value));
}

function buildIconSizeExpression(scale: number): maplibregl.ExpressionSpecification {
  const clamped = clampFlagSizeScale(scale);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2,
    FLAG_BASE_SIZES.zoom2 * clamped,
    4,
    FLAG_BASE_SIZES.zoom4 * clamped,
    7,
    FLAG_BASE_SIZES.zoom7 * clamped,
  ] as maplibregl.ExpressionSpecification;
}

function imageIdForAsset(assetId: string): string {
  return `${IMAGE_ID_PREFIX}${assetId}`;
}

function assetIdFromImageId(imageId: string): string | null {
  if (!imageId.startsWith(IMAGE_ID_PREFIX)) return null;
  return normalizeText(imageId.slice(IMAGE_ID_PREFIX.length));
}

function applyIconImageIds(data: FlagFeatureCollection): string[] {
  const ids = new Set<string>();

  for (const feature of data.features) {
    const props: FlagProperties = feature.properties ?? {};
    const iconAssetId = normalizeText(props.icon_asset_id);
    if (iconAssetId) {
      props[IMAGE_ID_PROPERTY] = imageIdForAsset(iconAssetId);
      ids.add(iconAssetId);
    } else {
      delete props[IMAGE_ID_PROPERTY];
    }
    feature.properties = props;
  }

  return [...ids];
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = src;
  });
}

async function ensureFlagImage(map: maplibregl.Map, assetId: string): Promise<void> {
  const imageId = imageIdForAsset(assetId);
  if (map.hasImage(imageId)) {
    return;
  }

  const existingLoad = flagImageLoadsInFlight.get(imageId);
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
      console.warn(`Failed to load flag icon for asset ${assetId}:`, error);
    })
    .finally(() => {
      flagImageLoadsInFlight.delete(imageId);
    });

  flagImageLoadsInFlight.set(imageId, loadPromise);
  return loadPromise;
}

function bindStyleImageMissingHandler(map: maplibregl.Map) {
  if (mapsWithMissingImageHandler.has(map)) {
    return;
  }

  map.on("styleimagemissing", (event) => {
    const imageId = normalizeText((event as { id?: unknown }).id);
    if (!imageId) return;

    const assetId = assetIdFromImageId(imageId);
    if (!assetId) return;

    void ensureFlagImage(map, assetId);
  });

  mapsWithMissingImageHandler.add(map);
}

function preloadFlagImages(map: maplibregl.Map, assetIds: string[]) {
  for (const assetId of assetIds) {
    void ensureFlagImage(map, assetId);
  }
}

/**
 * Add flag label layer.
 * Renders SVG icons from icon_asset_id when available.
 * Falls back to text short_value/country_code when an icon is missing.
 */
export async function addFlagLayer(map: maplibregl.Map) {
  const data = await loadFlagGeoJson();
  const iconAssetIds = applyIconImageIds(data);
  bindStyleImageMissingHandler(map);
  preloadFlagImages(map, iconAssetIds);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      minzoom: 2,
      maxzoom: 8,
      layout: {
        "icon-image": ["get", IMAGE_ID_PROPERTY],
        "icon-size": buildIconSizeExpression(DEFAULT_FLAG_SIZE_SCALE),
        "icon-allow-overlap": false,
        "icon-optional": true,
        "text-field": [
          "case",
          ["has", IMAGE_ID_PROPERTY],
          "",
          ["coalesce", ["get", "short_value"], ["get", "country_code"]],
        ],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          10,
          4,
          13,
          7,
          16,
        ],
        "text-font": ["Open Sans Bold"],
        "text-allow-overlap": false,
        "text-optional": true,
        "symbol-sort-key": ["get", "confidence"],
      },
      paint: {
        "text-color": "#1a1a2e",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    });
  }

  registerLayerGroup("flag", [LAYER_ID]);
}

export async function refreshFlagLayer(map: maplibregl.Map) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }
  const data = await loadFlagGeoJson();
  const iconAssetIds = applyIconImageIds(data);
  bindStyleImageMissingHandler(map);
  preloadFlagImages(map, iconAssetIds);
  source.setData(data);
}

export function setFlagMinConfidence(map: maplibregl.Map, minConfidence: number) {
  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  if (minConfidence <= 0) {
    map.setFilter(LAYER_ID, null);
    return;
  }

  map.setFilter(LAYER_ID, [
    ">=",
    ["coalesce", ["get", "confidence"], 0],
    minConfidence,
  ]);
}

export function setFlagSizeScale(map: maplibregl.Map, scale: number) {
  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  map.setLayoutProperty(LAYER_ID, "icon-size", buildIconSizeExpression(scale));
}

async function loadFlagGeoJson() {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "flag",
  });

  return JSON.parse(geojsonStr) as FlagFeatureCollection;
}
