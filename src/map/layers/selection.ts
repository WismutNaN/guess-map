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

export function setSelectedRegion(map: maplibregl.Map, region: RegionInfo | null) {
  if (!map.getLayer(COUNTRY_SELECTION_LAYER_ID) || !map.getLayer(ADMIN1_SELECTION_LAYER_ID)) {
    return;
  }

  if (!region) {
    map.setFilter(COUNTRY_SELECTION_LAYER_ID, EMPTY_COUNTRY_FILTER);
    map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
    return;
  }

  if (region.region_level === "country" && region.country_code) {
    map.setFilter(COUNTRY_SELECTION_LAYER_ID, [
      "==",
      ["get", "ISO_A2"],
      region.country_code,
    ]);
    map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
    return;
  }

  if (region.region_level === "admin1") {
    const countryCode = region.country_code;
    const admin1Code = region.geometry_ref?.replace(/^admin1:/, "");

    if (countryCode) {
      map.setFilter(COUNTRY_SELECTION_LAYER_ID, [
        "==",
        ["get", "ISO_A2"],
        countryCode,
      ]);
    } else {
      map.setFilter(COUNTRY_SELECTION_LAYER_ID, EMPTY_COUNTRY_FILTER);
    }

    if (admin1Code) {
      map.setFilter(ADMIN1_SELECTION_LAYER_ID, [
        "any",
        ["==", ["get", "iso_3166_2"], admin1Code],
        ["==", ["get", "adm1_code"], admin1Code],
      ]);
    } else {
      map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
    }
    return;
  }

  map.setFilter(COUNTRY_SELECTION_LAYER_ID, EMPTY_COUNTRY_FILTER);
  map.setFilter(ADMIN1_SELECTION_LAYER_ID, EMPTY_ADMIN1_FILTER);
}
