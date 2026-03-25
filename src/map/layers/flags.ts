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
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "flag",
  });

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: JSON.parse(geojsonStr),
  });

  map.addLayer({
    id: LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    minzoom: 2,
    maxzoom: 8,
    layout: {
      "text-field": ["get", "country_code"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        2, 10,
        4, 13,
        7, 16,
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

  registerLayerGroup("flag", [LAYER_ID]);
}
