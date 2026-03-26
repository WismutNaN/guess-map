import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "hint-flags";
const LAYER_ID = "hint-flags";

/**
 * Add flag label layer.
 * Renders country codes at anchor coordinates from compiled hint GeoJSON.
 * Will switch to SVG flag icons when image management is implemented.
 */
export async function addFlagLayer(map: maplibregl.Map) {
  const data = await loadFlagGeoJson();

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
        "text-field": ["get", "country_code"],
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

async function loadFlagGeoJson() {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "flag",
  });

  return JSON.parse(geojsonStr) as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
}
