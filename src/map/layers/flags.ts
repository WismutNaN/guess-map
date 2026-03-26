import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { registerLayerGroup } from "../layerManager";
import { applySlotLayout, setSlotLayers } from "./slots";
import { createHintImageCard, setHintCardImage } from "./hintCards";

const SOURCE_ID = "hint-flags";
const LAYER_ID = "hint-flags";
const IMAGE_ID_PREFIX = "flag-card:v3:";
const IMAGE_ID_PROPERTY = "icon_image_id";
export const DEFAULT_FLAG_SIZE_SCALE = 1.75;
const MIN_FLAG_SIZE_SCALE = 0.5;
const MAX_FLAG_SIZE_SCALE = 3.0;

type FlagProperties = GeoJSON.GeoJsonProperties & {
  icon_asset_id?: string;
  icon_image_id?: string;
  short_value?: string;
  country_code?: string;
  region_level?: string;
};

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

type FlagFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, FlagProperties>;

const mapsWithMissingImageHandler = new WeakSet<maplibregl.Map>();
const flagImageLoadsInFlight = new Map<string, Promise<void>>();
const flagCardDescriptors = new Map<string, FlagCardDescriptor>();

interface FlagCardDescriptor {
  imageId: string;
  assetId: string;
  subtitle: string | null;
}

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
    ["*", 0.058 * clamped, REGION_LEVEL_SIZE_FACTOR],
    4,
    ["*", 0.1 * clamped, REGION_LEVEL_SIZE_FACTOR],
    6,
    ["*", 0.15 * clamped, REGION_LEVEL_SIZE_FACTOR],
    8,
    ["*", 0.22 * clamped, REGION_LEVEL_SIZE_FACTOR],
  ] as maplibregl.ExpressionSpecification;
}

function imageIdForAsset(assetId: string): string {
  return `${IMAGE_ID_PREFIX}${assetId}`;
}

function registerFlagDescriptor(descriptor: FlagCardDescriptor) {
  const existing = flagCardDescriptors.get(descriptor.imageId);
  if (!existing) {
    flagCardDescriptors.set(descriptor.imageId, descriptor);
    return;
  }
  if (!existing.subtitle && descriptor.subtitle) {
    existing.subtitle = descriptor.subtitle;
  }
}

function applyIconImageIds(data: FlagFeatureCollection): string[] {
  const ids = new Set<string>();

  for (const feature of data.features) {
    const props: FlagProperties = feature.properties ?? {};
    const iconAssetId = normalizeText(props.icon_asset_id);
    if (iconAssetId) {
      const imageId = imageIdForAsset(iconAssetId);
      props[IMAGE_ID_PROPERTY] = imageId;
      registerFlagDescriptor({
        imageId,
        assetId: iconAssetId,
        subtitle: normalizeText(props.country_code) ?? normalizeText(props.short_value),
      });
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

async function ensureFlagImage(map: maplibregl.Map, imageId: string): Promise<void> {
  if (map.hasImage(imageId)) {
    return;
  }

  const descriptor = flagCardDescriptors.get(imageId);
  if (!descriptor) {
    return;
  }

  const existingLoad = flagImageLoadsInFlight.get(imageId);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    const dataUrl = await invoke<string>("get_asset_data_url", {
      assetId: descriptor.assetId,
    });
    const image = await loadImageElement(dataUrl);
    const card = createHintImageCard(image, {
      hintCode: "flag",
      tag: "Flag",
      subtitle: descriptor.subtitle,
    });
    setHintCardImage(map, imageId, card);
  })()
    .catch((error) => {
      console.warn(
        `Failed to load flag card icon ${imageId} (asset ${descriptor.assetId}):`,
        error
      );
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

    if (!imageId.startsWith(IMAGE_ID_PREFIX)) return;

    void ensureFlagImage(map, imageId);
  });

  mapsWithMissingImageHandler.add(map);
}

function preloadFlagImages(map: maplibregl.Map, assetIds: string[]) {
  for (const assetId of assetIds) {
    void ensureFlagImage(map, imageIdForAsset(assetId));
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
        "icon-ignore-placement": false,
        "icon-padding": 4,
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

  setSlotLayers(map, "flag", [{ layerId: LAYER_ID }]);
  applySlotLayout(map);
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
  applySlotLayout(map);
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
