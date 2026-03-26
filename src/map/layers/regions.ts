import maplibregl from "maplibre-gl";
import { patchCountryISOCodes } from "../geoPatch";
import type { EmptyRegionFilterInfo } from "../../types";

const COUNTRY_FILL_LAYER_ID = "region-country-fill";
const COUNTRY_BORDER_LAYER_ID = "region-country-border";
const ADMIN1_HIT_LAYER_ID = "region-admin1-hit";
const ADMIN1_BORDER_LAYER_ID = "region-admin1-border";

const EMPTY_COUNTRY_FILTER: maplibregl.FilterSpecification = [
  "==",
  ["get", "ISO_A2"],
  "__none__",
];

const EMPTY_ADMIN1_FILTER: maplibregl.FilterSpecification = [
  "==",
  ["get", "iso_3166_2"],
  "__none__",
];

/**
 * Load region GeoJSON sources and add country/admin1 border layers.
 * Includes hover interaction on countries.
 */
export async function addRegionLayers(map: maplibregl.Map) {
  await addCountryLayers(map);
  await addAdmin1Layers(map);
  addCountryInteractions(map);
}

async function addCountryLayers(map: maplibregl.Map) {
  const resp = await fetch("/geodata/ne_countries.geojson");
  const data = await resp.json();
  patchCountryISOCodes(data);

  map.addSource("regions-countries", { type: "geojson", data });

  map.addLayer({
    id: COUNTRY_FILL_LAYER_ID,
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
    id: COUNTRY_BORDER_LAYER_ID,
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
    id: ADMIN1_HIT_LAYER_ID,
    type: "fill",
    source: "regions-admin1",
    minzoom: 4,
    paint: {
      "fill-color": "#000000",
      "fill-opacity": 0.01,
    },
  });

  map.addLayer({
    id: ADMIN1_BORDER_LAYER_ID,
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

}

export function setEmptyRegionFilter(
  map: maplibregl.Map,
  filterInfo: EmptyRegionFilterInfo | null
) {
  if (!map.getLayer(COUNTRY_FILL_LAYER_ID) || !map.getLayer(ADMIN1_HIT_LAYER_ID)) {
    return;
  }

  if (!filterInfo) {
    map.setFilter(COUNTRY_FILL_LAYER_ID, null);
    map.setFilter(COUNTRY_BORDER_LAYER_ID, null);
    map.setFilter(ADMIN1_HIT_LAYER_ID, null);
    map.setFilter(ADMIN1_BORDER_LAYER_ID, null);
    return;
  }

  const countryFilter: maplibregl.FilterSpecification =
    filterInfo.country_codes.length > 0
      ? ["in", ["get", "ISO_A2"], ["literal", filterInfo.country_codes]]
      : EMPTY_COUNTRY_FILTER;
  const admin1Filter: maplibregl.FilterSpecification =
    filterInfo.admin1_codes.length > 0
      ? ([
          "any",
          ["in", ["get", "iso_3166_2"], ["literal", filterInfo.admin1_codes]],
          ["in", ["get", "adm1_code"], ["literal", filterInfo.admin1_codes]],
        ] as maplibregl.FilterSpecification)
      : EMPTY_ADMIN1_FILTER;

  map.setFilter(COUNTRY_FILL_LAYER_ID, countryFilter);
  map.setFilter(COUNTRY_BORDER_LAYER_ID, countryFilter);
  map.setFilter(ADMIN1_HIT_LAYER_ID, admin1Filter);
  map.setFilter(ADMIN1_BORDER_LAYER_ID, admin1Filter);
}
