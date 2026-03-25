import maplibregl from "maplibre-gl";

/**
 * Zoom-dependent scalerank filter — shared between dots and labels.
 * Shows progressively more cities as zoom increases.
 */
const SCALERANK_FILTER: maplibregl.FilterSpecification = [
  "any",
  ["all", ["<=", ["zoom"], 3], ["<=", ["get", "scalerank"], 1]],
  ["all", [">", ["zoom"], 3], ["<=", ["zoom"], 5], ["<=", ["get", "scalerank"], 3]],
  ["all", [">", ["zoom"], 5], ["<=", ["zoom"], 7], ["<=", ["get", "scalerank"], 5]],
  ["all", [">", ["zoom"], 7], ["<=", ["zoom"], 9], ["<=", ["get", "scalerank"], 7]],
  [">", ["zoom"], 9],
];

/**
 * Add city dots and labels from Natural Earth populated places.
 */
export async function addCityLayers(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_populated_places.geojson");
  const data = await resp.json();

  map.addSource("cities", { type: "geojson", data });

  // Labels first (so dots render below via beforeId)
  map.addLayer({
    id: "city-labels",
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
    filter: SCALERANK_FILTER,
  });

  map.addLayer(
    {
      id: "city-dots",
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
      filter: SCALERANK_FILTER,
    },
    "city-labels"
  );
}
