import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "hint-notes";
const LAYER_ID = "hint-notes";

async function loadNoteGeoJson() {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "note",
  });
  return JSON.parse(geojsonStr) as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
}

export async function addNoteLayer(map: maplibregl.Map) {
  const data = await loadNoteGeoJson();
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
      layout: {
        "text-field": ["coalesce", ["get", "short_value"], ["get", "full_value"]],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          10,
          6,
          13,
          10,
          15,
        ],
        "text-font": ["Open Sans Regular"],
        "text-anchor": "top",
        "text-offset": [0, 1],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#1a1a2e"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    });
  }

  registerLayerGroup("note", [LAYER_ID]);
}

export async function refreshNoteLayer(map: maplibregl.Map) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }
  const data = await loadNoteGeoJson();
  source.setData(data);
}

export function setNoteMinConfidence(map: maplibregl.Map, minConfidence: number) {
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
