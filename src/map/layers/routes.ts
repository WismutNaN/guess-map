import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "routes";
const LINE_LAYER_ID = "routes-line";
const LABEL_LAYER_ID = "routes-label";
const CASING_LAYER_ID = "routes-casing";
const HINT_TYPE_CODE = "highway";
const ROUTE_LAYER_IDS = [CASING_LAYER_ID, LINE_LAYER_ID, LABEL_LAYER_ID] as const;
const routeFilterState = new WeakMap<
  maplibregl.Map,
  { countryCode: string | null; minConfidence: number }
>();

async function loadRoutesGeoJson() {
  const geojsonStr = await invoke<string>("compile_line_layer", {
    hintTypeCode: HINT_TYPE_CODE,
  });
  return JSON.parse(geojsonStr) as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
}

/**
 * Load route GeoJSON and render as styled line layers.
 * US Interstates: red shield lines
 * European E-roads: green lines
 */
export async function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return;

  const data = await loadRoutesGeoJson();

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

  registerLayerGroup("routes", [...ROUTE_LAYER_IDS], false);
  routeFilterState.set(map, { countryCode: null, minConfidence: 0 });
}

export async function refreshRouteLayers(map: maplibregl.Map) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }
  const data = await loadRoutesGeoJson();
  source.setData(data);
}

export function setRoutesCountryFilter(map: maplibregl.Map, countryCode?: string | null) {
  const next = routeFilterState.get(map) ?? { countryCode: null, minConfidence: 0 };
  next.countryCode = countryCode ?? null;
  routeFilterState.set(map, next);
  applyRouteFilters(map, next.countryCode, next.minConfidence);
}

export function setRoutesMinConfidence(map: maplibregl.Map, minConfidence: number) {
  const next = routeFilterState.get(map) ?? { countryCode: null, minConfidence: 0 };
  next.minConfidence = Math.max(0, Math.min(1, minConfidence));
  routeFilterState.set(map, next);
  applyRouteFilters(map, next.countryCode, next.minConfidence);
}

function applyRouteFilters(
  map: maplibregl.Map,
  countryCode: string | null,
  minConfidence: number
) {
  const clauses: maplibregl.FilterSpecification[] = [];

  if (countryCode) {
    clauses.push([
      "any",
      ["==", ["get", "country_code"], countryCode],
      ["in", countryCode, ["get", "countries"]],
    ] as maplibregl.FilterSpecification);
  }

  if (minConfidence > 0) {
    clauses.push([
      ">=",
      ["coalesce", ["get", "confidence"], 0],
      minConfidence,
    ] as maplibregl.FilterSpecification);
  }

  const filter =
    clauses.length === 0
      ? null
      : clauses.length === 1
      ? clauses[0]
      : (["all", ...clauses] as maplibregl.FilterSpecification);

  for (const layerId of ROUTE_LAYER_IDS) {
    if (!map.getLayer(layerId)) {
      continue;
    }
    map.setFilter(layerId, filter);
  }
}
