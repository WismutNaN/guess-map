import maplibregl from "maplibre-gl";
import { setCityScaleRankMax } from "./layers/cities";

export type DensityPresetId = "minimal" | "balanced" | "dense" | "study";

export interface DensityPreset {
  id: DensityPresetId;
  label: string;
  overrides: {
    iconAllowOverlap: boolean;
    textMinZoom: number;
    imageMinZoom: number;
    cityScaleRankMax: number;
    collisionEnabled: boolean;
    hintMinZoomShift: number;
    flagMinZoom: number;
  };
}

export const DENSITY_PRESETS: Record<DensityPresetId, DensityPreset> = {
  minimal: {
    id: "minimal",
    label: "Minimal",
    overrides: {
      iconAllowOverlap: false,
      textMinZoom: 99,
      imageMinZoom: 99,
      cityScaleRankMax: 1,
      collisionEnabled: true,
      hintMinZoomShift: 2,
      flagMinZoom: 4,
    },
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    overrides: {
      iconAllowOverlap: false,
      textMinZoom: 5,
      imageMinZoom: 8,
      cityScaleRankMax: 3,
      collisionEnabled: true,
      hintMinZoomShift: 0,
      flagMinZoom: 2,
    },
  },
  dense: {
    id: "dense",
    label: "Dense",
    overrides: {
      iconAllowOverlap: true,
      textMinZoom: 3,
      imageMinZoom: 6,
      cityScaleRankMax: 7,
      collisionEnabled: false,
      hintMinZoomShift: -1,
      flagMinZoom: 2,
    },
  },
  study: {
    id: "study",
    label: "Study",
    overrides: {
      iconAllowOverlap: true,
      textMinZoom: 2,
      imageMinZoom: 2,
      cityScaleRankMax: 99,
      collisionEnabled: false,
      hintMinZoomShift: -2,
      flagMinZoom: 2,
    },
  },
};

export const DENSITY_PRESET_OPTIONS: Array<{
  id: DensityPresetId;
  label: string;
}> = (["minimal", "balanced", "dense", "study"] as DensityPresetId[]).map((id) => ({
  id,
  label: DENSITY_PRESETS[id].label,
}));

export const DEFAULT_DENSITY_PRESET: DensityPresetId = "balanced";

const FLAG_LAYER_ID = "hint-flags";
const NOTE_LAYER_ID = "hint-notes";
const THEMATIC_LAYER_PREFIX = "hint-themed-lyr:";
const HINT_GRID_LAYER_ID = "hint-grid";
const ROUTE_LABEL_LAYER_ID = "routes-label";

function clampMinZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(22, value));
}

function isThematicLayerId(layerId: string): boolean {
  return layerId.startsWith(THEMATIC_LAYER_PREFIX);
}

function getThematicLayerIds(map: maplibregl.Map): string[] {
  const style = map.getStyle();
  if (!style?.layers) return [];
  return style.layers
    .map((layer) => layer.id)
    .filter((id) => isThematicLayerId(id));
}

export function applyDensityPreset(map: maplibregl.Map, presetId: DensityPresetId) {
  const preset = DENSITY_PRESETS[presetId] ?? DENSITY_PRESETS[DEFAULT_DENSITY_PRESET];
  const shift = preset.overrides.hintMinZoomShift;
  const textOverlap = !preset.overrides.collisionEnabled;

  if (map.getLayer(FLAG_LAYER_ID)) {
    const minZoom = clampMinZoom(Math.max(preset.overrides.flagMinZoom, 2 + shift));
    map.setLayerZoomRange(FLAG_LAYER_ID, minZoom, 8);
    map.setLayoutProperty(
      FLAG_LAYER_ID,
      "icon-allow-overlap",
      preset.overrides.iconAllowOverlap
    );
    map.setLayoutProperty(FLAG_LAYER_ID, "text-allow-overlap", textOverlap);
    map.setLayoutProperty(FLAG_LAYER_ID, "text-ignore-placement", textOverlap);
    map.setLayoutProperty(FLAG_LAYER_ID, "text-optional", true);
  }

  for (const layerId of getThematicLayerIds(map)) {
    if (!map.getLayer(layerId)) {
      continue;
    }
    const minZoom = clampMinZoom(
      Math.max(preset.overrides.imageMinZoom, 2 + preset.overrides.hintMinZoomShift)
    );
    map.setLayerZoomRange(layerId, minZoom, 10);
    map.setLayoutProperty(
      layerId,
      "icon-allow-overlap",
      preset.overrides.iconAllowOverlap
    );
    map.setLayoutProperty(layerId, "text-allow-overlap", textOverlap);
    map.setLayoutProperty(layerId, "text-ignore-placement", textOverlap);
    map.setLayoutProperty(layerId, "text-optional", true);
  }

  // Unified hint grid layer (replaces both flags + thematic in new system)
  if (map.getLayer(HINT_GRID_LAYER_ID)) {
    const minZoom = clampMinZoom(
      Math.max(preset.overrides.flagMinZoom, 2 + shift)
    );
    map.setLayerZoomRange(HINT_GRID_LAYER_ID, minZoom, 10);
    map.setLayoutProperty(
      HINT_GRID_LAYER_ID,
      "icon-allow-overlap",
      preset.overrides.iconAllowOverlap
    );
    map.setLayoutProperty(HINT_GRID_LAYER_ID, "text-allow-overlap", textOverlap);
    map.setLayoutProperty(HINT_GRID_LAYER_ID, "text-ignore-placement", textOverlap);
    map.setLayoutProperty(HINT_GRID_LAYER_ID, "text-optional", true);
  }

  if (map.getLayer(NOTE_LAYER_ID)) {
    const minZoom = clampMinZoom(Math.max(preset.overrides.textMinZoom, 2 + shift));
    map.setLayerZoomRange(NOTE_LAYER_ID, minZoom, 15);
    map.setLayoutProperty(NOTE_LAYER_ID, "text-allow-overlap", textOverlap);
    map.setLayoutProperty(NOTE_LAYER_ID, "text-ignore-placement", textOverlap);
    map.setLayoutProperty(NOTE_LAYER_ID, "text-optional", true);
  }

  if (map.getLayer(ROUTE_LABEL_LAYER_ID)) {
    map.setLayoutProperty(ROUTE_LABEL_LAYER_ID, "text-allow-overlap", textOverlap);
    map.setLayoutProperty(ROUTE_LABEL_LAYER_ID, "text-ignore-placement", textOverlap);
    map.setLayoutProperty(ROUTE_LABEL_LAYER_ID, "text-optional", true);
  }

  setCityScaleRankMax(map, preset.overrides.cityScaleRankMax);
}
