import maplibregl from "maplibre-gl";
import { refreshDrivingSideLayer } from "./layers/drivingSide";
import { refreshFlagLayer, setFlagMinConfidence } from "./layers/flags";
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

  if (hintTypeCode === "flag") {
    await refreshFlagLayer(map);
    return;
  }

  if (hintTypeCode === "note") {
    await refreshNoteLayer(map);
    return;
  }

  if (hintTypeCode === "highway") {
    await refreshRouteLayers(map);
  }
}

export function applyMinConfidenceFilter(map: maplibregl.Map, minConfidence: number) {
  const normalized = Math.max(0, Math.min(1, minConfidence));
  setFlagMinConfidence(map, normalized);
  setNoteMinConfidence(map, normalized);
  setRoutesMinConfidence(map, normalized);
}
