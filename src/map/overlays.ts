export type OverlayCode = "gsv_coverage" | "routes";

export interface OverlayDefinition {
  code: OverlayCode;
  title: string;
  icon: string;
}

export const OVERLAY_LAYERS: readonly OverlayDefinition[] = [
  { code: "gsv_coverage", title: "GSV Coverage", icon: "📍" },
  { code: "routes", title: "Routes / Highways", icon: "🛣️" },
] as const;

export const COVERAGE_OVERLAY_CODE: OverlayCode = "gsv_coverage";
export const ROUTES_OVERLAY_CODE: OverlayCode = "routes";

/**
 * Hint types rendered by dedicated overlay pipelines and UI controls.
 * They should be hidden from the generic hint toggle list.
 */
const OVERLAY_MANAGED_HINT_CODES = new Set<string>(["coverage", "highway"]);

export function isOverlayManagedHintType(code: string): boolean {
  return OVERLAY_MANAGED_HINT_CODES.has(code);
}
