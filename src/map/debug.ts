import maplibregl from "maplibre-gl";

export interface DebugOverlayOptions {
  showCollisionBoxes: boolean;
  showTileBoundaries: boolean;
}

type DebugMap = maplibregl.Map & {
  showCollisionBoxes: boolean;
  showTileBoundaries: boolean;
};

export function applyDebugOverlayOptions(
  map: maplibregl.Map,
  options: DebugOverlayOptions
) {
  const debugMap = map as DebugMap;
  debugMap.showCollisionBoxes = options.showCollisionBoxes;
  debugMap.showTileBoundaries = options.showTileBoundaries;
}
