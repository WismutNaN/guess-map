import maplibregl from "maplibre-gl";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "routes";
const LINE_LAYER_ID = "routes-line";
const LABEL_LAYER_ID = "routes-label";
const CASING_LAYER_ID = "routes-casing";

/**
 * Load route GeoJSON and render as styled line layers.
 * US Interstates: red shield lines
 * European E-roads: green lines
 */
export async function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return;

  const resp = await fetch("/geodata/routes.geojson");
  const data = await resp.json();

  map.addSource(SOURCE_ID, { type: "geojson", data });

  // White casing (outline) for readability
  map.addLayer({
    id: CASING_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: "none",
    },
    paint: {
      "line-color": "#ffffff",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        3, 2.5,
        6, 5,
        10, 8,
      ],
      "line-opacity": 0.8,
    },
  });

  // Colored line fill
  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: "none",
    },
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        3, 1.5,
        6, 3,
        10, 5,
      ],
      "line-opacity": 0.85,
    },
  });

  // Route number labels along the line
  map.addLayer({
    id: LABEL_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    minzoom: 4,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 200,
      "text-field": ["get", "route_number"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        4, 10,
        7, 13,
        10, 16,
      ],
      "text-font": ["Open Sans Bold"],
      "text-rotation-alignment": "viewport",
      "text-allow-overlap": false,
      visibility: "none",
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  registerLayerGroup("routes", [CASING_LAYER_ID, LINE_LAYER_ID, LABEL_LAYER_ID], false);
}
