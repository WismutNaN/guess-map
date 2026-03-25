import maplibregl from "maplibre-gl";

export async function addRegionLayers(map: maplibregl.Map) {
  // Load countries GeoJSON from public directory
  const countriesResp = await fetch("/geodata/ne_countries.geojson");
  const countriesData = await countriesResp.json();

  map.addSource("regions-countries", {
    type: "geojson",
    data: countriesData,
  });

  // Country fill — subtle transparent fill for hover interaction
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

  // Country borders
  map.addLayer({
    id: "region-country-border",
    type: "line",
    source: "regions-countries",
    paint: {
      "line-color": "#627BC1",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1, 0.5,
        4, 1,
        8, 1.5,
      ],
      "line-opacity": 0.6,
    },
  });

  // Load admin1 GeoJSON
  const admin1Resp = await fetch("/geodata/ne_admin1.geojson");
  const admin1Data = await admin1Resp.json();

  map.addSource("regions-admin1", {
    type: "geojson",
    data: admin1Data,
  });

  // Admin1 borders — visible only at higher zoom
  map.addLayer({
    id: "region-admin1-border",
    type: "line",
    source: "regions-admin1",
    minzoom: 4,
    paint: {
      "line-color": "#8899AA",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 0.3,
        8, 0.8,
      ],
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 0.2,
        7, 0.5,
      ],
      "line-dasharray": [2, 2],
    },
  });

  // Hover interaction for countries
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

  // Click — show country name tooltip
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
