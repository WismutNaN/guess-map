import { invoke } from "@tauri-apps/api/core";
import type { DensityPresetId } from "./presets";
import type { PresentationMode } from "./presentation";

interface MapPosition {
  lng: number;
  lat: number;
  zoom: number;
}

const DEFAULT_POSITION: MapPosition = {
  lng: 20,
  lat: 30,
  zoom: 2.5,
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let displaySaveTimeout: ReturnType<typeof setTimeout> | null = null;

export interface DisplaySettings {
  densityPreset: DensityPresetId;
  presentationMode: PresentationMode;
  showCollisionBoxes: boolean;
  showTileBoundaries: boolean;
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  densityPreset: "balanced",
  presentationMode: "icons_text",
  showCollisionBoxes: false,
  showTileBoundaries: false,
};

export async function loadMapPosition(): Promise<MapPosition> {
  try {
    const lngStr = await invoke<string>("get_setting_or", {
      key: "map.center_lng",
      default: String(DEFAULT_POSITION.lng),
    });
    const latStr = await invoke<string>("get_setting_or", {
      key: "map.center_lat",
      default: String(DEFAULT_POSITION.lat),
    });
    const zoomStr = await invoke<string>("get_setting_or", {
      key: "map.zoom",
      default: String(DEFAULT_POSITION.zoom),
    });

    return {
      lng: parseFloat(lngStr),
      lat: parseFloat(latStr),
      zoom: parseFloat(zoomStr),
    };
  } catch (e) {
    console.warn("Failed to load map position, using defaults:", e);
    return DEFAULT_POSITION;
  }
}

export function saveMapPosition(lng: number, lat: number, zoom: number) {
  // Debounce saves to avoid flooding SQLite
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await invoke("set_setting", {
        key: "map.center_lng",
        value: String(lng),
      });
      await invoke("set_setting", {
        key: "map.center_lat",
        value: String(lat),
      });
      await invoke("set_setting", {
        key: "map.zoom",
        value: String(zoom),
      });
    } catch (e) {
      console.warn("Failed to save map position:", e);
    }
  }, 1000);
}

function parseDensityPreset(raw: string): DensityPresetId {
  if (raw === "minimal" || raw === "balanced" || raw === "dense" || raw === "study") {
    return raw;
  }
  return DEFAULT_DISPLAY_SETTINGS.densityPreset;
}

function parsePresentationMode(raw: string): PresentationMode {
  if (raw === "icons_only" || raw === "icons_text" || raw === "icons_thumbnails") {
    return raw;
  }
  return DEFAULT_DISPLAY_SETTINGS.presentationMode;
}

function parseBool(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function loadDisplaySettings(): Promise<DisplaySettings> {
  try {
    const densityPreset = parseDensityPreset(
      await invoke<string>("get_setting_or", {
        key: "map.density_preset",
        default: DEFAULT_DISPLAY_SETTINGS.densityPreset,
      })
    );
    const presentationMode = parsePresentationMode(
      await invoke<string>("get_setting_or", {
        key: "map.presentation_mode",
        default: DEFAULT_DISPLAY_SETTINGS.presentationMode,
      })
    );
    const showCollisionBoxes = parseBool(
      await invoke<string>("get_setting_or", {
        key: "map.debug.show_collision_boxes",
        default: "0",
      })
    );
    const showTileBoundaries = parseBool(
      await invoke<string>("get_setting_or", {
        key: "map.debug.show_tile_boundaries",
        default: "0",
      })
    );

    return {
      densityPreset,
      presentationMode,
      showCollisionBoxes,
      showTileBoundaries,
    };
  } catch (error) {
    console.warn("Failed to load display settings, using defaults:", error);
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function saveDisplaySettings(settings: DisplaySettings) {
  if (displaySaveTimeout) clearTimeout(displaySaveTimeout);
  displaySaveTimeout = setTimeout(async () => {
    try {
      await invoke("set_setting", {
        key: "map.density_preset",
        value: settings.densityPreset,
      });
      await invoke("set_setting", {
        key: "map.presentation_mode",
        value: settings.presentationMode,
      });
      await invoke("set_setting", {
        key: "map.debug.show_collision_boxes",
        value: settings.showCollisionBoxes ? "1" : "0",
      });
      await invoke("set_setting", {
        key: "map.debug.show_tile_boundaries",
        value: settings.showTileBoundaries ? "1" : "0",
      });
    } catch (error) {
      console.warn("Failed to save display settings:", error);
    }
  }, 400);
}

// ---------------------------------------------------------------------------
// Layer visibility persistence
// ---------------------------------------------------------------------------

let layerVisSaveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function loadLayerVisibility(): Promise<Record<string, boolean>> {
  try {
    const raw = await invoke<string>("get_setting_or", {
      key: "map.layer_visibility",
      default: "{}",
    });
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "boolean") result[k] = v;
      }
      return result;
    }
  } catch (e) {
    console.warn("Failed to load layer visibility:", e);
  }
  return {};
}

export function saveLayerVisibility(visibility: Record<string, boolean>) {
  if (layerVisSaveTimeout) clearTimeout(layerVisSaveTimeout);
  layerVisSaveTimeout = setTimeout(async () => {
    try {
      await invoke("set_setting", {
        key: "map.layer_visibility",
        value: JSON.stringify(visibility),
      });
    } catch (error) {
      console.warn("Failed to save layer visibility:", error);
    }
  }, 600);
}
