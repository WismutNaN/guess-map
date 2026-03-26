import maplibregl from "maplibre-gl";

/**
 * Zoom-dependent scalerank filter — shared between dots and labels.
 * Shows progressively more cities as zoom increases.
 */
const CITY_DOT_LAYER_ID = "city-dots";
const CITY_LABEL_LAYER_ID = "city-labels";
const DEFAULT_SCALERANK_CAP = 99;
const cityScaleRankCapByMap = new WeakMap<maplibregl.Map, number>();

function buildScalerankFilter(scaleRankCap: number): maplibregl.FilterSpecification {
  const cap = Number.isFinite(scaleRankCap)
    ? Math.max(1, Math.floor(scaleRankCap))
    : DEFAULT_SCALERANK_CAP;
  const capAt = (stageLimit: number) => Math.min(stageLimit, cap);

  return [
    "any",
    ["all", ["<=", ["zoom"], 3], ["<=", ["get", "scalerank"], capAt(1)]],
    [
      "all",
      [">", ["zoom"], 3],
      ["<=", ["zoom"], 5],
      ["<=", ["get", "scalerank"], capAt(3)],
    ],
    [
      "all",
      [">", ["zoom"], 5],
      ["<=", ["zoom"], 7],
      ["<=", ["get", "scalerank"], capAt(5)],
    ],
    [
      "all",
      [">", ["zoom"], 7],
      ["<=", ["zoom"], 9],
      ["<=", ["get", "scalerank"], capAt(7)],
    ],
    ["all", [">", ["zoom"], 9], ["<=", ["get", "scalerank"], cap]],
  ];
}

/**
 * Add city dots and labels from Natural Earth populated places.
 */
export async function addCityLayers(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_populated_places.geojson");
  const data = await resp.json();
  const scaleRankCap = cityScaleRankCapByMap.get(map) ?? DEFAULT_SCALERANK_CAP;
  const scalerankFilter = buildScalerankFilter(scaleRankCap);

  map.addSource("cities", { type: "geojson", data });

  // Labels first (so dots render below via beforeId)
  map.addLayer({
    id: CITY_LABEL_LAYER_ID,
    type: "symbol",
    source: "cities",
    minzoom: 2,
    layout: {
      "text-field": ["get", "name"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        2, 10,
        6, 12,
        10, 14,
      ],
      "text-anchor": "bottom",
      "text-offset": [0, -0.5],
      "text-allow-overlap": false,
      "text-optional": true,
      "symbol-sort-key": ["get", "scalerank"],
    },
    paint: {
      "text-color": "#1a1a2e",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
    filter: scalerankFilter,
  });

  map.addLayer(
    {
      id: CITY_DOT_LAYER_ID,
      type: "circle",
      source: "cities",
      minzoom: 2,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2, 1.5,
          6, 2.5,
          10, 4,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "featurecla"], "Admin-0 capital"],
          "#e63946",
          "#2a6f97",
        ],
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "#ffffff",
      },
      filter: scalerankFilter,
    },
    CITY_LABEL_LAYER_ID
  );
}

export function setCityScaleRankMax(map: maplibregl.Map, scaleRankCap: number) {
  const cap = Number.isFinite(scaleRankCap)
    ? Math.max(1, Math.floor(scaleRankCap))
    : DEFAULT_SCALERANK_CAP;
  cityScaleRankCapByMap.set(map, cap);

  const filter = buildScalerankFilter(cap);
  if (map.getLayer(CITY_LABEL_LAYER_ID)) {
    map.setFilter(CITY_LABEL_LAYER_ID, filter);
  }
  if (map.getLayer(CITY_DOT_LAYER_ID)) {
    map.setFilter(CITY_DOT_LAYER_ID, filter);
  }
}
