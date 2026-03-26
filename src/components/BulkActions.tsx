import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { AssetInfo, BatchMutationResult, HintTypeInfo, RegionInfo } from "../types";
import { AssetUpload } from "./AssetUpload";

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

/** Hint types whose display_family is image-oriented. */
const IMAGE_FAMILIES = new Set(["image", "icon"]);

const MAX_PREVIEW = 8;

/**
 * Standalone bottom bar for bulk operations on multiple selected regions.
 * Only renders when 2+ regions are selected.
 */
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
  const [drivingSide, setDrivingSide] = useState<DrivingSide>("right");
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedType = useMemo(
    () => hintTypes.find((t) => t.code === hintTypeCode) ?? null,
    [hintTypes, hintTypeCode]
  );
  const isDrivingSide = hintTypeCode === "driving_side";
  const isImageType = selectedType ? IMAGE_FAMILIES.has(selectedType.display_family) : false;
  const count = selectedRegions.length;

  const previewNames = useMemo(
    () => selectedRegions.slice(0, MAX_PREVIEW).map((r) => r.name_en || r.name),
    [selectedRegions]
  );
  const hiddenCount = Math.max(0, count - MAX_PREVIEW);

  const countrySummary = useMemo(() => {
    const byCc = new Map<string, number>();
    for (const r of selectedRegions) {
      const cc = r.country_code ?? "??";
      byCc.set(cc, (byCc.get(cc) ?? 0) + 1);
    }
    return Array.from(byCc.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cc, n]) => `${cc} (${n})`)
      .join(", ");
  }, [selectedRegions]);

  useEffect(() => {
    let cancelled = false;
    void invoke<HintTypeInfo[]>("get_hint_types")
      .then((types) => {
        if (cancelled) return;
        const active = types.filter((t) => t.is_active && t.display_family !== "line");
        setHintTypes(active);
        if (active.length > 0) {
          setHintTypeCode((cur) => cur || active[0].code);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset feedback when selection changes
  useEffect(() => {
    setLastResult(null);
    setError(null);
  }, [count]);

  if (count <= 1) return null;

  const handleSubmit = async () => {
    if (!hintTypeCode) return;
    setSubmitting(true);
    setError(null);
    setLastResult(null);

    const regionIds = selectedRegions.map((r) => r.id);

    try {
      if (mode === "apply") {
        const base = {
          regionIds,
          hintTypeCode,
          confidence: Number.parseFloat(confidence) || 1,
          isVisible: true,
          createdBy: "user",
          imageAssetId: asset?.id ?? null,
        };

        const payload = isDrivingSide
          ? {
              ...base,
              shortValue: drivingSide,
              dataJson: { side: drivingSide },
              color: DRIVING_SIDE_COLORS[drivingSide],
            }
          : {
              ...base,
              shortValue: shortValue.trim() || null,
            };

        const result = await invoke<BatchMutationResult>("batch_create_hints", {
          input: payload,
        });
        setLastResult(`Applied to ${result.affected} regions`);
      } else {
        const result = await invoke<BatchMutationResult>("batch_delete_hints", {
          input: { regionIds, hintTypeCode, createdBy: "user" },
        });
        setLastResult(`Deleted from ${result.affected} regions`);
      }
      onHintChanged(hintTypeCode);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`bulk-bar${expanded ? " bulk-bar-expanded" : ""}`}>
      {/* Left: selection info */}
      <div className="bulk-bar-info">
        <div className="bulk-bar-title">
          {count} regions selected
          <button
            type="button"
            className="bulk-bar-clear"
            onClick={onClearSelection}
            title="Clear selection"
          >
            {"\u2715"}
          </button>
        </div>
        <div className="bulk-bar-summary">{countrySummary}</div>
        <div className="bulk-bar-names">
          {previewNames.join(", ")}
          {hiddenCount > 0 ? `, +${hiddenCount} more` : ""}
        </div>
      </div>

      {/* Center: operation form */}
      <div className="bulk-bar-form">
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
            Remove
          </button>
        </div>

        <select
          className="bulk-bar-select"
          value={hintTypeCode}
          onChange={(e) => {
            setHintTypeCode(e.target.value);
            setAsset(null);
          }}
        >
          {hintTypes.map((t) => (
            <option key={t.id} value={t.code}>
              {t.title}
            </option>
          ))}
        </select>

        {mode === "apply" && (
          <>
            {isDrivingSide ? (
              <select
                className="bulk-bar-select"
                value={drivingSide}
                onChange={(e) => setDrivingSide(e.target.value as DrivingSide)}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="mixed">Mixed</option>
              </select>
            ) : (
              <input
                className="bulk-bar-input"
                value={shortValue}
                onChange={(e) => setShortValue(e.target.value)}
                placeholder="Value"
              />
            )}
            <input
              className="bulk-bar-input bulk-bar-input-narrow"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              title="Confidence (0\u20131)"
            />
            {/* Image attach toggle */}
            {isImageType && !expanded && (
              <button
                type="button"
                className="btn-secondary bulk-bar-attach"
                onClick={() => setExpanded(true)}
                title="Attach image to all hints"
              >
                + Image
              </button>
            )}
          </>
        )}
      </div>

      {/* Right: submit + feedback */}
      <div className="bulk-bar-submit">
        <button
          type="button"
          className="btn-primary"
          disabled={submitting || !hintTypeCode}
          onClick={handleSubmit}
        >
          {submitting
            ? "Working\u2026"
            : mode === "apply"
            ? `Apply to ${count}`
            : `Remove from ${count}`}
        </button>
        {lastResult && <div className="bulk-bar-result">{lastResult}</div>}
        {error && <div className="bulk-bar-error">{error}</div>}
      </div>

      {/* Expanded: image upload row */}
      {expanded && mode === "apply" && (
        <div className="bulk-bar-image-row">
          <AssetUpload value={asset} onChange={setAsset} />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setExpanded(false);
              setAsset(null);
            }}
          >
            Cancel image
          </button>
        </div>
      )}
    </div>
  );
}
