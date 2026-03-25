import { invoke } from "@tauri-apps/api/core";

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
