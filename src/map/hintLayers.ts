import maplibregl from "maplibre-gl";
import { refreshDrivingSideLayer } from "./layers/drivingSide";
import {
  isHintGridCode,
  refreshHintGridType,
  setHintGridMinConfidence,
} from "./layers/hintGrid";
import { refreshNoteLayer, setNoteMinConfidence } from "./layers/note";
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

  // All other types (flag, sign, bollard, etc.) are managed by the grid
  if (isHintGridCode(map, hintTypeCode)) {
    await refreshHintGridType(map, hintTypeCode);
    return;
  }

  // Unknown type — attempt grid refresh anyway (might have been added dynamically)
  await refreshHintGridType(map, hintTypeCode);
}

export function applyMinConfidenceFilter(map: maplibregl.Map, minConfidence: number) {
  const normalized = Math.max(0, Math.min(1, minConfidence));
  setHintGridMinConfidence(map, normalized);
  setNoteMinConfidence(map, normalized);
  setRoutesMinConfidence(map, normalized);
}
