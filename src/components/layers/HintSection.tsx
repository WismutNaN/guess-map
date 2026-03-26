import type { HintTypeInfo } from "../../types";

interface HintSectionProps {
  hintTypes: HintTypeInfo[];
  counts: Record<string, number>;
  visibility: Record<string, boolean>;
  onToggle: (code: string) => void;
}

export function HintSection({
  hintTypes,
  counts,
  visibility,
  onToggle,
}: HintSectionProps) {
  return (
    <>
      <div className="layer-section-label">Hints</div>
      {hintTypes.map((hintType) => {
        const count = counts[hintType.code] ?? 0;
        const hasData = count > 0;
        return (
          <label
            key={hintType.code}
            className={`layer-item${!hasData ? " layer-item-empty" : ""}`}
          >
            <input
              type="checkbox"
              checked={visibility[hintType.code] ?? false}
              disabled={!hasData && !(visibility[hintType.code] ?? false)}
              onChange={() => onToggle(hintType.code)}
            />
            <span className="layer-item-title">{hintType.title}</span>
            <span className="layer-item-count">{hasData ? count : "--"}</span>
          </label>
        );
      })}
    </>
  );
}
