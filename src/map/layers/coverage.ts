import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { registerLayerGroup } from "../layerManager";

const SOURCE_ID = "gsv-coverage";
const LAYER_ID = "gsv-coverage";
const TILE_PROXY_PORT_SETTING = "tile_proxy.port";
const MIN_PORT = 1;
const MAX_PORT = 65535;

export const DEFAULT_COVERAGE_OPACITY = 0.74;

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COVERAGE_OPACITY;
  return Math.max(0, Math.min(1, value));
}

async function getTileProxyPort(): Promise<number> {
  const portValue = await invoke<string>("get_setting_or", {
    key: TILE_PROXY_PORT_SETTING,
    default: "0",
  });
  const port = Number.parseInt(portValue, 10);
  if (!Number.isFinite(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`Invalid tile proxy port: ${portValue}`);
  }
  return port;
}

/**
 * Google Street View coverage raster overlay.
 * Tiles are loaded from local Tauri proxy server on 127.0.0.1.
 * This avoids direct cross-domain Google requests from WebView2.
 */
export async function addCoverageLayer(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return;

  const port = await getTileProxyPort();
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
      // Slightly boosted visibility for thin coverage lines.
      "raster-opacity": DEFAULT_COVERAGE_OPACITY,
      "raster-contrast": 0.28,
      "raster-saturation": 0.12,
      "raster-fade-duration": 0,
    },
  });

  registerLayerGroup("gsv_coverage", [LAYER_ID], false);
}

export function setCoverageOpacity(map: maplibregl.Map, opacity: number) {
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, "raster-opacity", clampOpacity(opacity));
  }
}
