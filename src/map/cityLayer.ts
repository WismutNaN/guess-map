import maplibregl from "maplibre-gl";

export async function addCityLayer(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_populated_places.geojson");
  const data = await resp.json();

  map.addSource("cities", {
    type: "geojson",
    data,
  });

  // City labels — zoom-dependent filtering by scalerank
  map.addLayer({
    id: "city-labels",
    type: "symbol",
    source: "cities",
    minzoom: 2,
    layout: {
      "text-field": ["get", "name"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
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
    // Filter by scalerank based on zoom level
    filter: [
      "any",
      // Zoom 2-3: only capitals (scalerank <= 1)
      [
        "all",
        ["<=", ["zoom"], 3],
        ["<=", ["get", "scalerank"], 1],
      ],
      // Zoom 4-5: large cities (scalerank <= 3)
      [
        "all",
        [">", ["zoom"], 3],
        ["<=", ["zoom"], 5],
        ["<=", ["get", "scalerank"], 3],
      ],
      // Zoom 6-7: medium cities (scalerank <= 5)
      [
        "all",
        [">", ["zoom"], 5],
        ["<=", ["zoom"], 7],
        ["<=", ["get", "scalerank"], 5],
      ],
      // Zoom 8-9: more cities (scalerank <= 7)
      [
        "all",
        [">", ["zoom"], 7],
        ["<=", ["zoom"], 9],
        ["<=", ["get", "scalerank"], 7],
      ],
      // Zoom 10+: all cities
      [">", ["zoom"], 9],
    ],
  });

  // City dots
  map.addLayer(
    {
      id: "city-dots",
      type: "circle",
      source: "cities",
      minzoom: 2,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
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
      // Same filter as labels
      filter: [
        "any",
        [
          "all",
          ["<=", ["zoom"], 3],
          ["<=", ["get", "scalerank"], 1],
        ],
        [
          "all",
          [">", ["zoom"], 3],
          ["<=", ["zoom"], 5],
          ["<=", ["get", "scalerank"], 3],
        ],
        [
          "all",
          [">", ["zoom"], 5],
          ["<=", ["zoom"], 7],
          ["<=", ["get", "scalerank"], 5],
        ],
        [
          "all",
          [">", ["zoom"], 7],
          ["<=", ["zoom"], 9],
          ["<=", ["get", "scalerank"], 7],
        ],
        [">", ["zoom"], 9],
      ],
    },
    "city-labels" // Place dots below labels
  );
}
