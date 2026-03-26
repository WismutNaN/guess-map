import { invoke } from "@tauri-apps/api/core";
import type { RegionHintInfo } from "../../types";

interface HintListProps {
  hints: RegionHintInfo[];
  loading: boolean;
  onEdit: (hint: RegionHintInfo) => void;
  onDeleted: (hint: RegionHintInfo) => void;
}

/** Scrollable list of hints attached to a region with edit/delete actions. */
export function HintList({ hints, loading, onEdit, onDeleted }: HintListProps) {
  const handleDelete = (hint: RegionHintInfo) => {
    if (!confirm("Delete this hint?")) return;
    void invoke("delete_hint", { hintId: hint.id, createdBy: "user" })
      .then(() => onDeleted(hint))
      .catch((err) => console.error("Failed to delete hint:", err));
  };

  return (
    <div className="region-hints">
      <div className="section-title">Hints ({hints.length})</div>

      {loading && <div className="section-muted">Loading\u2026</div>}

      {!loading && hints.length === 0 && (
        <div className="section-muted">No hints for this region.</div>
      )}

      {!loading &&
        hints.map((hint) => (
          <div key={hint.id} className="hint-item">
            <div className="hint-item-head">
              <span className="hint-type">{hint.hint_type_code}</span>
              <span className="hint-confidence">
                {hint.confidence.toFixed(2)}
              </span>
            </div>
            {hint.short_value && (
              <div className="hint-short">{hint.short_value}</div>
            )}
            {hint.full_value && (
              <div className="hint-full">{hint.full_value}</div>
            )}
            <div className="hint-actions">
              <button type="button" onClick={() => onEdit(hint)}>
                Edit
              </button>
              <button type="button" onClick={() => handleDelete(hint)}>
                Delete
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
