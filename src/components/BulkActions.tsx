import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { BatchMutationResult, HintTypeInfo, RegionInfo } from "../types";

interface BulkActionsProps {
  selectedRegions: RegionInfo[];
  onClearSelection: () => void;
  onHintChanged: (hintTypeCode: string) => void;
}

type BulkMode = "apply" | "delete";
type DrivingSide = "left" | "right" | "mixed";

const DRIVING_SIDE_COLORS: Record<DrivingSide, string> = {
  left: "#4A90D9",
  right: "#D94A4A",
  mixed: "#D9A84A",
};

export function BulkActions({
  selectedRegions,
  onClearSelection,
  onHintChanged,
}: BulkActionsProps) {
  const [hintTypes, setHintTypes] = useState<HintTypeInfo[]>([]);
  const [mode, setMode] = useState<BulkMode>("apply");
  const [hintTypeCode, setHintTypeCode] = useState("");
  const [shortValue, setShortValue] = useState("");
  const [confidence, setConfidence] = useState("1");
  const [drivingSide, setDrivingSide] = useState<DrivingSide>("left");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewNames = useMemo(
    () => selectedRegions.slice(0, 6).map((region) => region.name_en || region.name),
    [selectedRegions]
  );
  const hiddenCount = Math.max(0, selectedRegions.length - previewNames.length);
  const isDrivingSide = hintTypeCode === "driving_side";

  useEffect(() => {
    let cancelled = false;
    void invoke<HintTypeInfo[]>("get_hint_types")
      .then((types) => {
        if (cancelled) {
          return;
        }
        const active = types.filter((type) => type.is_active && type.display_family !== "line");
        setHintTypes(active);
        if (active.length > 0) {
          setHintTypeCode((current) => current || active[0].code);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(String(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (selectedRegions.length <= 1) {
    return null;
  }

  const handleSubmit = async () => {
    if (!hintTypeCode) {
      return;
    }
    setSubmitting(true);
    setError(null);

    const regionIds = selectedRegions.map((region) => region.id);

    try {
      if (mode === "apply") {
        const payload = isDrivingSide
          ? {
              regionIds,
              hintTypeCode,
              shortValue: drivingSide,
              dataJson: { side: drivingSide },
              color: DRIVING_SIDE_COLORS[drivingSide],
              confidence: Number.parseFloat(confidence) || 1,
              isVisible: true,
              createdBy: "user",
            }
          : {
              regionIds,
              hintTypeCode,
              shortValue: shortValue.trim() || null,
              confidence: Number.parseFloat(confidence) || 1,
              isVisible: true,
              createdBy: "user",
            };

        await invoke<BatchMutationResult>("batch_create_hints", { input: payload });
      } else {
        await invoke<BatchMutationResult>("batch_delete_hints", {
          input: {
            regionIds,
            hintTypeCode,
            createdBy: "user",
          },
        });
      }
      onHintChanged(hintTypeCode);
    } catch (submitError) {
      setError(String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bulk-actions">
      <div className="section-title">Bulk actions ({selectedRegions.length} selected)</div>
      <div className="bulk-list">
        {previewNames.map((name) => (
          <div key={name} className="bulk-item">
            {name}
          </div>
        ))}
        {hiddenCount > 0 ? <div className="bulk-item">+{hiddenCount} more</div> : null}
      </div>
      <button type="button" onClick={onClearSelection}>
        Clear selection
      </button>

      <div className="bulk-mode-toggle">
        <button
          type="button"
          className={mode === "apply" ? "active" : ""}
          onClick={() => setMode("apply")}
        >
          Apply
        </button>
        <button
          type="button"
          className={mode === "delete" ? "active" : ""}
          onClick={() => setMode("delete")}
        >
          Delete
        </button>
      </div>

      <div className="form-field">
        <label htmlFor="bulk-type">Type</label>
        <select
          id="bulk-type"
          value={hintTypeCode}
          onChange={(event) => setHintTypeCode(event.target.value)}
        >
          {hintTypes.map((type) => (
            <option key={type.id} value={type.code}>
              {type.title}
            </option>
          ))}
        </select>
      </div>

      {mode === "apply" && (
        <>
          {isDrivingSide ? (
            <div className="form-field">
              <label htmlFor="bulk-driving-side">Driving side</label>
              <select
                id="bulk-driving-side"
                value={drivingSide}
                onChange={(event) => setDrivingSide(event.target.value as DrivingSide)}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="bulk-short">Short value</label>
              <input
                id="bulk-short"
                value={shortValue}
                onChange={(event) => setShortValue(event.target.value)}
                placeholder="Value for all selected regions"
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="bulk-confidence">Confidence (0-1)</label>
            <input
              id="bulk-confidence"
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
            />
          </div>
        </>
      )}

      {error ? <div className="section-muted">Error: {error}</div> : null}

      <button type="button" disabled={submitting || !hintTypeCode} onClick={handleSubmit}>
        {mode === "apply"
          ? `Apply to ${selectedRegions.length} regions`
          : `Delete in ${selectedRegions.length} regions`}
      </button>
    </div>
  );
}
