import maplibregl from "maplibre-gl";
import { refreshDrivingSideLayer } from "./layers/drivingSide";
import { refreshFlagLayer } from "./layers/flags";
import { refreshNoteLayer } from "./layers/note";

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
  }
}
