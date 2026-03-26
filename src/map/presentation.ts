import maplibregl from "maplibre-gl";
import {
  DEFAULT_DENSITY_PRESET,
  DENSITY_PRESETS,
  type DensityPresetId,
} from "./presets";

export type PresentationMode = "icons_only" | "icons_text" | "icons_thumbnails";

export const PRESENTATION_MODE_OPTIONS: Array<{
  id: PresentationMode;
  label: string;
}> = [
  { id: "icons_only", label: "Icons" },
  { id: "icons_text", label: "Icons+Text" },
  { id: "icons_thumbnails", label: "Icons+Images" },
];

export const DEFAULT_PRESENTATION_MODE: PresentationMode = "icons_text";

const FLAG_LAYER_ID = "hint-flags";
const NOTE_LAYER_ID = "hint-notes";
const THEMATIC_LAYER_PREFIX = "hint-themed-lyr:";
const HINT_GRID_LAYER_ID = "hint-grid";

const EMPTY_TEXT_FIELD = ["literal", ""] as maplibregl.ExpressionSpecification;

const FLAG_TEXT_VALUE = [
  "coalesce",
  ["get", "short_value"],
  ["get", "country_code"],
  "",
] as maplibregl.ExpressionSpecification;

const HINT_TEXT_VALUE = [
  "coalesce",
  ["get", "short_value"],
  ["get", "full_value"],
  "",
] as maplibregl.ExpressionSpecification;

function withZoomGate(
  minZoom: number,
  valueExpression: maplibregl.ExpressionSpecification
): maplibregl.ExpressionSpecification {
  if (minZoom >= 99) {
    return EMPTY_TEXT_FIELD;
  }

  return [
    "case",
    [">=", ["zoom"], minZoom],
    valueExpression,
    EMPTY_TEXT_FIELD,
  ] as maplibregl.ExpressionSpecification;
}

function getThematicLayerIds(map: maplibregl.Map): string[] {
  const style = map.getStyle();
  if (!style?.layers) return [];
  return style.layers
    .map((layer) => layer.id)
    .filter((layerId) => layerId.startsWith(THEMATIC_LAYER_PREFIX));
}

export function applyPresentationMode(
  map: maplibregl.Map,
  mode: PresentationMode,
  densityPreset: DensityPresetId
) {
  const preset = DENSITY_PRESETS[densityPreset] ?? DENSITY_PRESETS[DEFAULT_DENSITY_PRESET];
  const textMinZoom = preset.overrides.textMinZoom;
  const textFieldForMode =
    mode === "icons_text" ? withZoomGate(textMinZoom, HINT_TEXT_VALUE) : EMPTY_TEXT_FIELD;
  const flagTextFieldForMode =
    mode === "icons_text" ? withZoomGate(textMinZoom, FLAG_TEXT_VALUE) : EMPTY_TEXT_FIELD;

  if (map.getLayer(FLAG_LAYER_ID)) {
    map.setLayoutProperty(FLAG_LAYER_ID, "text-field", flagTextFieldForMode);
  }

  for (const layerId of getThematicLayerIds(map)) {
    if (!map.getLayer(layerId)) {
      continue;
    }
    map.setLayoutProperty(layerId, "text-field", textFieldForMode);
  }

  // Unified hint grid
  if (map.getLayer(HINT_GRID_LAYER_ID)) {
    map.setLayoutProperty(HINT_GRID_LAYER_ID, "text-field", textFieldForMode);
  }

  if (map.getLayer(NOTE_LAYER_ID)) {
    map.setLayoutProperty(NOTE_LAYER_ID, "text-field", textFieldForMode);
  }
}
