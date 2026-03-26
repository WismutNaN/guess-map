import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "hint-notes";
const LAYER_ID = "hint-notes";
const mapsWithImagePopupBinding = new WeakSet<maplibregl.Map>();
const imageDataUrlCache = new Map<string, Promise<string>>();
const popupByMap = new WeakMap<maplibregl.Map, maplibregl.Popup>();

type NoteFeatureProperties = GeoJSON.GeoJsonProperties & {
  short_value?: string;
  full_value?: string;
  source_note?: string;
  image_asset_id?: string;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function closePopup(map: maplibregl.Map) {
  const popup = popupByMap.get(map);
  if (!popup) return;
  popup.remove();
  popupByMap.delete(map);
}

function getAssetDataUrl(assetId: string): Promise<string> {
  const existing = imageDataUrlCache.get(assetId);
  if (existing) return existing;

  const promise = invoke<string>("get_asset_data_url", { assetId })
    .catch((error) => {
      imageDataUrlCache.delete(assetId);
      throw error;
    });
  imageDataUrlCache.set(assetId, promise);
  return promise;
}

function buildPopupContent(
  title: string,
  description: string | null,
  sourceNote: string | null,
  imageUrl: string
): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "hint-image-popup";

  const heading = document.createElement("div");
  heading.className = "hint-image-popup-title";
  heading.textContent = title;
  root.appendChild(heading);

  const figure = document.createElement("div");
  figure.className = "hint-image-popup-figure";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = title;
  img.src = imageUrl;
  figure.appendChild(img);
  root.appendChild(figure);

  if (description) {
    const body = document.createElement("div");
    body.className = "hint-image-popup-body";
    body.textContent = description;
    root.appendChild(body);
  }

  if (sourceNote) {
    const meta = document.createElement("div");
    meta.className = "hint-image-popup-meta";
    meta.textContent = sourceNote;
    root.appendChild(meta);
  }

  return root;
}

function toPopupLngLat(
  feature: maplibregl.MapGeoJSONFeature,
  fallback: maplibregl.LngLat
): maplibregl.LngLatLike {
  const geom = feature.geometry;
  if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
    const [lng, lat] = geom.coordinates;
    if (typeof lng === "number" && typeof lat === "number") {
      return [lng, lat];
    }
  }
  return [fallback.lng, fallback.lat];
}

function bindNoteImagePopup(map: maplibregl.Map) {
  if (mapsWithImagePopupBinding.has(map)) {
    return;
  }

  map.on("mouseenter", LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", LAYER_ID, (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const props = (feature.properties ?? {}) as NoteFeatureProperties;
    const imageAssetId = normalizeText(props.image_asset_id);
    if (!imageAssetId) return;

    if (event.originalEvent instanceof MouseEvent) {
      event.originalEvent.stopPropagation();
    }

    const title =
      normalizeText(props.short_value) ??
      normalizeText(props.full_value) ??
      "Hint image";
    const description = normalizeText(props.full_value);
    const sourceNote = normalizeText(props.source_note);
    const lngLat = toPopupLngLat(feature, event.lngLat);

    closePopup(map);

    void getAssetDataUrl(imageAssetId)
      .then((imageUrl) => {
        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "420px",
          className: "hint-image-popup-shell",
        })
          .setLngLat(lngLat)
          .setDOMContent(buildPopupContent(title, description, sourceNote, imageUrl))
          .addTo(map);

        popupByMap.set(map, popup);
      })
      .catch((error) => {
        console.error("Failed to open note image popup:", error);
      });
  });

  mapsWithImagePopupBinding.add(map);
}

async function loadNoteGeoJson() {
  const geojsonStr = await invoke<string>("compile_hint_layer", {
    hintTypeCode: "note",
  });
  return JSON.parse(geojsonStr) as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
}

export async function addNoteLayer(map: maplibregl.Map) {
  const data = await loadNoteGeoJson();
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      minzoom: 2,
      layout: {
        "text-field": ["coalesce", ["get", "short_value"], ["get", "full_value"]],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          10,
          6,
          13,
          10,
          15,
        ],
        "text-font": ["Open Sans Regular"],
        "text-anchor": "top",
        "text-offset": [0, 1],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": ["coalesce", ["get", "color"], "#1a1a2e"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    });
  }

  bindNoteImagePopup(map);
  registerLayerGroup("note", [LAYER_ID]);
}

export async function refreshNoteLayer(map: maplibregl.Map) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    return;
  }
  const data = await loadNoteGeoJson();
  source.setData(data);
}

export function setNoteMinConfidence(map: maplibregl.Map, minConfidence: number) {
  if (!map.getLayer(LAYER_ID)) {
    return;
  }

  if (minConfidence <= 0) {
    map.setFilter(LAYER_ID, null);
    return;
  }

  map.setFilter(LAYER_ID, [
    ">=",
    ["coalesce", ["get", "confidence"], 0],
    minConfidence,
  ]);
}
