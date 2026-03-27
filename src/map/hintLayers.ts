import maplibregl from "maplibre-gl";
import { refreshDrivingSideLayer } from "./layers/drivingSide";
import {
  isHintGridCode,
  refreshHintGridType,
  setHintGridMinConfidence,
} from "./layers/hintGrid";
import { refreshNoteLayer, setNoteMinConfidence } from "./layers/note";
import { isPolygonHintCode, refreshPolygonHintLayer } from "./layers/polygonHints";
import { refreshRouteLayers, setRoutesMinConfidence } from "./layers/routes";

export async function refreshHintTypeOnMap(
  map: maplibregl.Map,
  hintTypeCode: string
) {
  if (hintTypeCode === "driving_side") {
    await refreshDrivingSideLayer(map);
    return;
  }

  if (hintTypeCode === "note") {
    await refreshNoteLayer(map);
    return;
  }

  if (hintTypeCode === "highway") {
    await refreshRouteLayers(map);
    return;
  }

  if (isPolygonHintCode(map, hintTypeCode)) {
    await refreshPolygonHintLayer(map, hintTypeCode);
    return;
  }

  // All other types (flag, sign, bollard, etc.) are managed by the grid
  if (isHintGridCode(map, hintTypeCode)) {
    await refreshHintGridType(map, hintTypeCode);
    return;
  }

  // Unknown type — try polygon layer first, then grid as fallback.
  if (await refreshPolygonHintLayer(map, hintTypeCode)) {
    return;
  }
  await refreshHintGridType(map, hintTypeCode);
}

export function applyMinConfidenceFilter(map: maplibregl.Map, minConfidence: number) {
  const normalized = Math.max(0, Math.min(1, minConfidence));
  setHintGridMinConfidence(map, normalized);
  setNoteMinConfidence(map, normalized);
  setRoutesMinConfidence(map, normalized);
}
