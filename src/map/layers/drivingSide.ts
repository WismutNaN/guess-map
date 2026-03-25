import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { registerLayerGroup } from "../layerManager";

const LAYER_ID = "hint-driving-side";

/**
 * Add driving_side polygon fill layer.
 * Fetches enrichment data from Rust backend, builds a MapLibre match
 * expression on ISO_A2 to color countries by driving side.
 */
export async function addDrivingSideLayer(map: maplibregl.Map) {
  const enrichmentJson = await invoke<string>("compile_polygon_enrichment", {
    hintTypeCode: "driving_side",
  });
  const enrichment: Record<string, { color?: string }> =
    JSON.parse(enrichmentJson);

  const matchExpr: unknown[] = ["match", ["get", "ISO_A2"]];
  for (const [cc, props] of Object.entries(enrichment)) {
    if (props.color) {
      matchExpr.push(cc, props.color);
    }
  }
  matchExpr.push("transparent");

  map.addLayer(
    {
      id: LAYER_ID,
      type: "fill",
      source: "regions-countries",
      paint: {
        "fill-color": matchExpr as maplibregl.ExpressionSpecification,
        "fill-opacity": 0.25,
      },
    },
    "region-country-border"
  );

  registerLayerGroup("driving_side", [LAYER_ID]);
}
