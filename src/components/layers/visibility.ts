import type { OverlayDefinition } from "../../map/overlays";
import type { HintTypeInfo } from "../../types";
import { getDefaultVisibility } from "./layerGroups";

/**
 * Merge layer visibility state.
 *
 * Priority: savedVisibility > previous > group defaults.
 * `savedVisibility` comes from SQLite persistence (may be empty on first run).
 */
export function mergeLayerVisibility(
  previous: Record<string, boolean>,
  overlays: readonly OverlayDefinition[],
  hintTypes: HintTypeInfo[],
  counts: Record<string, number>,
  savedVisibility: Record<string, boolean> = {},
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...previous };

  for (const overlay of overlays) {
    next[overlay.code] =
      savedVisibility[overlay.code] ??
      previous[overlay.code] ??
      false;
  }

  for (const hintType of hintTypes) {
    const code = hintType.code;
    const hasData = (counts[code] ?? 0) > 0;
    next[code] =
      savedVisibility[code] ??
      previous[code] ??
      getDefaultVisibility(code, hasData);
  }

  return next;
}

export function emitVisibilityState(
  onToggle: (code: string, visible: boolean) => void,
  overlays: readonly OverlayDefinition[],
  hintTypes: HintTypeInfo[],
  previousVisibility: Record<string, boolean>,
  visibility: Record<string, boolean>,
): number {
  let emitted = 0;
  const hasOwn = (key: string) =>
    Object.prototype.hasOwnProperty.call(previousVisibility, key);

  for (const hintType of hintTypes) {
    const code = hintType.code;
    const next = visibility[code] ?? false;
    if (hasOwn(code) && previousVisibility[code] === next) {
      continue;
    }
    onToggle(code, next);
    emitted += 1;
  }

  for (const overlay of overlays) {
    const code = overlay.code;
    const next = visibility[code] ?? false;
    if (hasOwn(code) && previousVisibility[code] === next) {
      continue;
    }
    onToggle(code, next);
    emitted += 1;
  }

  return emitted;
}
