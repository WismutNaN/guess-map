import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";

/**
 * Add driving_side polygon fill layer.
 * Fetches enrichment data from Rust backend, matches by ISO_A2 property,
 * and colors countries by driving side.
 */
export async function addDrivingSideLayer(map: maplibregl.Map) {
  const enrichmentJson = await invoke<string>("compile_polygon_enrichment", {
    hintTypeCode: "driving_side",
  });
  const enrichment: Record<
    string,
    { side?: string; color?: string; short_value?: string }
  > = JSON.parse(enrichmentJson);

  // Build a match expression for fill-color based on ISO_A2
  // ["match", ["get", "ISO_A2"], "GB", "#4A90D9", "US", "#D94A4A", ..., "transparent"]
  const matchExpr: any[] = ["match", ["get", "ISO_A2"]];
  for (const [cc, props] of Object.entries(enrichment)) {
    if (props.color) {
      matchExpr.push(cc, props.color);
    }
  }
  matchExpr.push("transparent"); // fallback

  map.addLayer(
    {
      id: "hint-driving-side",
      type: "fill",
      source: "regions-countries",
      paint: {
        "fill-color": matchExpr as any,
        "fill-opacity": 0.25,
      },
    },
    "region-country-border" // insert below borders
  );
}

/**
 * Add flag emoji symbol layer.
 * Fetches compiled point GeoJSON from Rust backend and renders emoji text.
 */
export async function addFlagLayer(map: maplibregl.Map) {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "flag",
  });
  const geojson = JSON.parse(geojsonStr);

  map.addSource("hint-flags", {
    type: "geojson",
    data: geojson,
  });

  map.addLayer({
    id: "hint-flags",
    type: "symbol",
    source: "hint-flags",
    minzoom: 2,
    maxzoom: 8,
    layout: {
      "text-field": ["get", "short_value"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2, 16,
        4, 22,
        7, 28,
      ],
      "text-allow-overlap": false,
      "text-optional": true,
      "symbol-sort-key": ["get", "confidence"],
    },
  });
}

/** All hint layer IDs for toggling visibility */
export const HINT_LAYER_IDS: Record<string, string[]> = {
  driving_side: ["hint-driving-side"],
  flag: ["hint-flags"],
};

/** Toggle visibility of a hint layer group */
export function setHintLayerVisibility(
  map: maplibregl.Map,
  hintTypeCode: string,
  visible: boolean
) {
  const layerIds = HINT_LAYER_IDS[hintTypeCode];
  if (!layerIds) return;
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }
}
