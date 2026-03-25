import maplibregl from "maplibre-gl";

/**
 * Load region GeoJSON sources and add country/admin1 border layers.
 * Includes hover interaction and click popup for countries.
 */
export async function addRegionLayers(map: maplibregl.Map) {
  await addCountryLayers(map);
  await addAdmin1Layers(map);
  addCountryInteractions(map);
}

async function addCountryLayers(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_countries.geojson");
  const data = await resp.json();

  map.addSource("regions-countries", { type: "geojson", data });

  map.addLayer({
    id: "region-country-fill",
    type: "fill",
    source: "regions-countries",
    paint: {
      "fill-color": "#627BC1",
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.15,
        0.03,
      ],
    },
  });

  map.addLayer({
    id: "region-country-border",
    type: "line",
    source: "regions-countries",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#627BC1",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        1, 0.8,
        4, 1.2,
        8, 1.8,
      ],
      "line-opacity": 0.7,
    },
  });
}

async function addAdmin1Layers(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_admin1.geojson");
  const data = await resp.json();

  map.addSource("regions-admin1", { type: "geojson", data });

  map.addLayer({
    id: "region-admin1-border",
    type: "line",
    source: "regions-admin1",
    minzoom: 4,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#8899AA",
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.3,
        8, 0.8,
      ],
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.2,
        7, 0.5,
      ],
      "line-dasharray": [2, 2],
    },
  });
}

function addCountryInteractions(map: maplibregl.Map) {
  let hoveredId: number | string | null = null;

  map.on("mousemove", "region-country-fill", (e) => {
    if (e.features && e.features.length > 0) {
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: "regions-countries", id: hoveredId },
          { hover: false }
        );
      }
      hoveredId = e.features[0].id ?? null;
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: "regions-countries", id: hoveredId },
          { hover: true }
        );
      }
      map.getCanvas().style.cursor = "pointer";
    }
  });

  map.on("mouseleave", "region-country-fill", () => {
    if (hoveredId !== null) {
      map.setFeatureState(
        { source: "regions-countries", id: hoveredId },
        { hover: false }
      );
    }
    hoveredId = null;
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "region-country-fill", (e) => {
    if (e.features && e.features.length > 0) {
      const props = e.features[0].properties;
      const name = props?.NAME_EN || props?.NAME || "Unknown";
      new maplibregl.Popup({ closeButton: false, maxWidth: "200px" })
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${name}</strong>`)
        .addTo(map);
    }
  });
}
