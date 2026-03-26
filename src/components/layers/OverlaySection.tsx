import { COVERAGE_OVERLAY_CODE, OVERLAY_LAYERS } from "../../map/overlays";

interface OverlaySectionProps {
  visibility: Record<string, boolean>;
  coverageOpacityPercent: number;
  onToggle: (code: string) => void;
  onCoverageOpacityChange: (valuePercent: number) => void;
}

export function OverlaySection({
  visibility,
  coverageOpacityPercent,
  onToggle,
  onCoverageOpacityChange,
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
    </>
  );
}
