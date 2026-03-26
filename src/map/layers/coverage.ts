import maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "gsv-coverage";
const LAYER_ID = "gsv-coverage";

/**
 * Google Street View coverage raster overlay.
 * Tiles are loaded from local Tauri proxy server on 127.0.0.1.
 * This avoids direct cross-domain Google requests from WebView2.
 */
export async function addCoverageLayer(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return;

  const portValue = await invoke<string>("get_setting_or", {
    key: "tile_proxy.port",
    default: "0",
  });
  const port = Number.parseInt(portValue, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid tile proxy port: ${portValue}`);
  }
  const tileUrl = `http://127.0.0.1:${port}/svv/{z}/{x}/{y}`;

  map.addSource(SOURCE_ID, {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 21,
    attribution: "Coverage data © Google",
  });

  map.addLayer({
    id: LAYER_ID,
    type: "raster",
    source: SOURCE_ID,
    layout: {
      visibility: "none",
    },
    paint: {
      "raster-opacity": 0.7,
    },
  });

  registerLayerGroup("gsv_coverage", [LAYER_ID], false);
}

export function setCoverageOpacity(map: maplibregl.Map, opacity: number) {
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, "raster-opacity", opacity);
  }
}
