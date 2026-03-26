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
