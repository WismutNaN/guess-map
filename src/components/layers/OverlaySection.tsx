import {
  COVERAGE_OVERLAY_CODE,
  OVERLAY_LAYERS,
  ROUTES_OVERLAY_CODE,
} from "../../map/overlays";

interface OverlaySectionProps {
  visibility: Record<string, boolean>;
  coverageOpacityPercent: number;
  routesFilterMode: "all" | "selected_country";
  selectedCountryCode?: string | null;
  onToggle: (code: string) => void;
  onCoverageOpacityChange: (valuePercent: number) => void;
  onRoutesFilterModeChange: (mode: "all" | "selected_country") => void;
}

export function OverlaySection({
  visibility,
  coverageOpacityPercent,
  routesFilterMode,
  selectedCountryCode,
  onToggle,
  onCoverageOpacityChange,
  onRoutesFilterModeChange,
}: OverlaySectionProps) {
  return (
    <>
      <div className="layer-section-label">Overlays</div>
      {OVERLAY_LAYERS.map((overlay) => (
        <label key={overlay.code} className="layer-item">
          <input
            type="checkbox"
            checked={visibility[overlay.code] ?? false}
            onChange={() => onToggle(overlay.code)}
          />
          <span className="layer-item-title">
            {overlay.icon} {overlay.title}
          </span>
        </label>
      ))}

      {visibility[COVERAGE_OVERLAY_CODE] && (
        <div className="overlay-slider-block">
          <div className="overlay-slider-label">
            Coverage opacity
            <span>{coverageOpacityPercent}%</span>
          </div>
          <input
            className="overlay-slider"
            type="range"
            min={20}
            max={100}
            step={1}
            value={coverageOpacityPercent}
            onChange={(event) =>
              onCoverageOpacityChange(Number.parseInt(event.target.value, 10))
            }
          />
        </div>
      )}

      {visibility[ROUTES_OVERLAY_CODE] && (
        <div className="overlay-filter-block">
          <div className="overlay-slider-label">Routes filter</div>
          <select
            className="overlay-filter-select"
            value={routesFilterMode}
            onChange={(event) =>
              onRoutesFilterModeChange(event.target.value as "all" | "selected_country")
            }
          >
            <option value="all">All regions</option>
            <option value="selected_country" disabled={!selectedCountryCode}>
              {selectedCountryCode
                ? `Selected country (${selectedCountryCode})`
                : "Selected country (no selection)"}
            </option>
          </select>
        </div>
      )}
    </>
  );
}
