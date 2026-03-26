import maplibregl from "maplibre-gl";
import type { RegionInfo } from "../../types";

const COUNTRY_SELECTION_LAYER_ID = "region-country-selection";
const ADMIN1_SELECTION_LAYER_ID = "region-admin1-selection";

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

export function addSelectionLayers(map: maplibregl.Map) {
  if (!map.getLayer(COUNTRY_SELECTION_LAYER_ID)) {
    map.addLayer({
      id: COUNTRY_SELECTION_LAYER_ID,
      type: "line",
      source: "regions-countries",
      paint: {
        "line-color": "#f4b942",
        "line-width": 2.2,
      },
      filter: EMPTY_COUNTRY_FILTER,
    });
  }

  if (!map.getLayer(ADMIN1_SELECTION_LAYER_ID)) {
    map.addLayer({
      id: ADMIN1_SELECTION_LAYER_ID,
      type: "line",
      source: "regions-admin1",
      minzoom: 3,
      paint: {
        "line-color": "#ffd166",
        "line-width": 2,
      },
      filter: EMPTY_ADMIN1_FILTER,
    });
  }
}

export function setSelectedRegions(map: maplibregl.Map, regions: RegionInfo[]) {
  if (!map.getLayer(COUNTRY_SELECTION_LAYER_ID) || !map.getLayer(ADMIN1_SELECTION_LAYER_ID)) {
    return;
  }

  if (regions.length === 0) {
    map.setFilter(COUNTRY_SELECTION_LAYER_ID, EMPTY_COUNTRY_FILTER);
    map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
    return;
  }

  const countryCodes = Array.from(
    new Set(
      regions
        .map((region) => region.country_code?.trim())
        .filter((code): code is string => Boolean(code))
    )
  );
  const admin1Codes = Array.from(
    new Set(
      regions
        .filter((region) => region.region_level === "admin1")
        .map((region) => region.geometry_ref?.replace(/^admin1:/, "").trim())
        .filter((code): code is string => Boolean(code))
    )
  );

  if (countryCodes.length > 0) {
    map.setFilter(COUNTRY_SELECTION_LAYER_ID, [
      "in",
      ["get", "ISO_A2"],
      ["literal", countryCodes],
    ]);
  } else {
    map.setFilter(COUNTRY_SELECTION_LAYER_ID, EMPTY_COUNTRY_FILTER);
  }

  if (admin1Codes.length > 0) {
    map.setFilter(ADMIN1_SELECTION_LAYER_ID, [
      "any",
      ["in", ["get", "iso_3166_2"], ["literal", admin1Codes]],
      ["in", ["get", "adm1_code"], ["literal", admin1Codes]],
    ]);
  } else {
    map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
  }
}
