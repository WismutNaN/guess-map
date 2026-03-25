import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { RegionHintInfo, RegionInfo } from "../types";
import { HintForm } from "./HintForm";

interface RegionInspectorProps {
  region: RegionInfo | null;
  onDeselect: () => void;
  onHintChanged: (hintTypeCode: string) => void;
}

export function RegionInspector({
  region,
  onDeselect,
  onHintChanged,
}: RegionInspectorProps) {
  const [hints, setHints] = useState<RegionHintInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingHint, setEditingHint] = useState<RegionHintInfo | null>(null);

  const loadHints = async (regionId: string) => {
    setLoading(true);
    try {
      const data = await invoke<RegionHintInfo[]>("get_hints_by_region", {
        regionId,
      });
      setHints(data);
    } catch (error) {
      console.error("Failed to load hints:", error);
      setHints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!region) {
      setHints([]);
      setIsAdding(false);
      setEditingHint(null);
      return;
    }
    void loadHints(region.id);
  }, [region?.id]);

  if (!region) {
    return (
      <aside className="region-inspector empty">
        <div className="region-empty-title">No region selected</div>
        <div className="region-empty-subtitle">
          Select a region on the map or via search.
        </div>
      </aside>
    );
  }

  return (
    <aside className="region-inspector">
      <div className="region-header">
        <div className="region-title">{region.name_en || region.name}</div>
        <div className="region-meta">
          {region.region_level}
          {region.country_code ? ` · ${region.country_code}` : ""}
        </div>
        <div className="region-anchor">
          Anchor:{" "}
          {region.anchor_lng !== null && region.anchor_lng !== undefined
            ? `${region.anchor_lng.toFixed(3)}, ${region.anchor_lat?.toFixed(3)}`
            : "n/a"}
        </div>
      </div>

      <div className="region-actions">
        <button type="button" onClick={() => setIsAdding(true)}>
          Add hint
        </button>
        <button type="button" onClick={onDeselect}>
          Deselect
        </button>
      </div>

      {(isAdding || editingHint) && (
        <HintForm
          region={region}
          initialHint={editingHint}
          onCancel={() => {
            setIsAdding(false);
            setEditingHint(null);
          }}
          onSaved={(savedHint) => {
            setIsAdding(false);
            setEditingHint(null);
            void loadHints(region.id);
            onHintChanged(savedHint.hint_type_code);
          }}
        />
      )}

      <div className="region-hints">
        <div className="section-title">Attached hints ({hints.length})</div>
        {loading ? <div className="section-muted">Loading…</div> : null}
        {!loading && hints.length === 0 ? (
          <div className="section-muted">No hints for this region.</div>
        ) : null}
        {!loading &&
          hints.map((hint) => (
            <div key={hint.id} className="hint-item">
              <div className="hint-item-head">
                <span className="hint-type">{hint.hint_type_code}</span>
                <span className="hint-confidence">{hint.confidence.toFixed(2)}</span>
              </div>
              {hint.short_value ? (
                <div className="hint-short">{hint.short_value}</div>
              ) : null}
              {hint.full_value ? (
                <div className="hint-full">{hint.full_value}</div>
              ) : null}
              <div className="hint-actions">
                <button type="button" onClick={() => setEditingHint(hint)}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("Delete this hint?")) return;
                    void invoke("delete_hint", {
                      hintId: hint.id,
                      createdBy: "user",
                    })
                      .then(() => loadHints(region.id))
                      .then(() => onHintChanged(hint.hint_type_code))
                      .catch((error) =>
                        console.error("Failed to delete hint:", error)
                      );
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}
