import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { HintTypeInfo } from "../../types";
import { registerLayerGroup } from "../layerManager";
import { colorForHintCode } from "./hintCards";

const FILL_LAYER_PREFIX = "hint-poly-fill:";
const OUTLINE_LAYER_PREFIX = "hint-poly-outline:";
const EXCLUDED_CODES = new Set(["driving_side", "coverage"]);

type EnrichmentMap = Record<string, { color?: string | null }>;

const stateByMap = new WeakMap<maplibregl.Map, Map<string, HintTypeInfo>>();

function isManagedPolygonType(ht: HintTypeInfo): boolean {
  return (
    ht.is_active &&
    ht.display_family === "polygon_fill" &&
    !EXCLUDED_CODES.has(ht.code)
  );
}

function fillLayerId(code: string): string {
  return `${FILL_LAYER_PREFIX}${code}`;
}

function outlineLayerId(code: string): string {
  return `${OUTLINE_LAYER_PREFIX}${code}`;
}

function buildColorExpression(
  enrichment: EnrichmentMap,
  fallbackColor: string,
): maplibregl.ExpressionSpecification {
  const expr: unknown[] = ["match", ["get", "ISO_A2"]];
  for (const [countryCode, props] of Object.entries(enrichment)) {
    const color = typeof props?.color === "string" ? props.color.trim() : "";
    expr.push(countryCode, color.length > 0 ? color : fallbackColor);
  }
  expr.push("transparent");
  return expr as maplibregl.ExpressionSpecification;
}

async function buildColorForType(
  hintTypeCode: string,
): Promise<maplibregl.ExpressionSpecification> {
  const enrichmentJson = await invoke<string>("compile_polygon_enrichment", {
    hintTypeCode,
  });
  const enrichment = JSON.parse(enrichmentJson) as EnrichmentMap;
  const fallbackColor = colorForHintCode(hintTypeCode);
  return buildColorExpression(enrichment, fallbackColor);
}

async function upsertPolygonTypeLayer(
  map: maplibregl.Map,
  hintType: HintTypeInfo,
) {
  const fillId = fillLayerId(hintType.code);
  const borderId = outlineLayerId(hintType.code);
  const colorExpression = await buildColorForType(hintType.code);

  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: "regions-countries",
      paint: {
        "fill-color": colorExpression,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.34,
          6,
          0.24,
          10,
          0.16,
        ],
      },
    });
  } else {
    map.setPaintProperty(fillId, "fill-color", colorExpression);
  }

  if (!map.getLayer(borderId)) {
    map.addLayer({
      id: borderId,
      type: "line",
      source: "regions-countries",
      paint: {
        "line-color": colorExpression,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.9,
          5,
          1.2,
          8,
          1.6,
        ],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.66,
          8,
          0.88,
        ],
      },
    });
  } else {
    map.setPaintProperty(borderId, "line-color", colorExpression);
  }

  registerLayerGroup(hintType.code, [fillId, borderId]);
}

export async function addPolygonHintLayers(
  map: maplibregl.Map,
): Promise<void> {
  const allTypes = await invoke<HintTypeInfo[]>("get_hint_types");
  const polygonTypes = allTypes
    .filter(isManagedPolygonType)
    .sort((a, b) => a.sort_order - b.sort_order);

  const known = new Map<string, HintTypeInfo>();
  for (const hintType of polygonTypes) {
    known.set(hintType.code, hintType);
    await upsertPolygonTypeLayer(map, hintType);
  }

  stateByMap.set(map, known);
}

export function isPolygonHintCode(map: maplibregl.Map, code: string): boolean {
  const known = stateByMap.get(map);
  return known?.has(code) ?? false;
}

export async function refreshPolygonHintLayer(
  map: maplibregl.Map,
  hintTypeCode: string,
): Promise<boolean> {
  let known = stateByMap.get(map);
  if (!known) {
    known = new Map<string, HintTypeInfo>();
    stateByMap.set(map, known);
  }

  let hintType = known.get(hintTypeCode);
  if (!hintType) {
    const allTypes = await invoke<HintTypeInfo[]>("get_hint_types");
    hintType = allTypes.find((it) => it.code === hintTypeCode);
    if (!hintType || !isManagedPolygonType(hintType)) {
      return false;
    }
    known.set(hintTypeCode, hintType);
  }

  await upsertPolygonTypeLayer(map, hintType);
  return true;
}

