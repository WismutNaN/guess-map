import type { OverlayDefinition } from "../../map/overlays";
import type { HintTypeInfo } from "../../types";

export function mergeLayerVisibility(
  previous: Record<string, boolean>,
  overlays: readonly OverlayDefinition[],
  hintTypes: HintTypeInfo[],
  counts: Record<string, number>
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...previous };

  for (const overlay of overlays) {
    next[overlay.code] = previous[overlay.code] ?? false;
  }

  for (const hintType of hintTypes) {
    next[hintType.code] = previous[hintType.code] ?? (counts[hintType.code] ?? 0) > 0;
  }

  return next;
}

export function emitVisibilityState(
  onToggle: (code: string, visible: boolean) => void,
  overlays: readonly OverlayDefinition[],
  hintTypes: HintTypeInfo[],
  visibility: Record<string, boolean>
) {
  for (const hintType of hintTypes) {
    onToggle(hintType.code, visibility[hintType.code] ?? false);
  }

  for (const overlay of overlays) {
    onToggle(overlay.code, visibility[overlay.code] ?? false);
  }
}
