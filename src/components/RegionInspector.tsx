import { useState } from "react";
import { useRegionHints } from "../hooks/useRegionHints";
import type { RegionHintInfo, RegionInfo } from "../types";
import { HintForm } from "./HintForm";
import { HintList, RegionHeader, SelectionActions } from "./inspector";

interface RegionInspectorProps {
  region: RegionInfo | null;
  selectedCount: number;
  onSelectionChange: (regions: RegionInfo[], activeRegion: RegionInfo | null) => void;
  onHintChanged: (hintTypeCode: string) => void;
}

/**
 * Right sidebar: shows the active region's details, its hints,
 * and an add/edit form. Selection management is separated into
 * sub-components. BulkActions now lives outside as a standalone panel.
 */
export function RegionInspector({
  region,
  selectedCount,
  onSelectionChange,
  onHintChanged,
}: RegionInspectorProps) {
  const { hints, loading, reload } = useRegionHints(region?.id ?? null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingHint, setEditingHint] = useState<RegionHintInfo | null>(null);

  // Reset form state when region changes
  if (!region) {
    return (
      <aside className="region-inspector empty">
        <div className="region-empty-title">No region selected</div>
        <div className="region-empty-subtitle">
          Click a region on the map, or use Search.
        </div>
      </aside>
    );
  }

  const handleSaved = (saved: RegionHintInfo) => {
    setIsAdding(false);
    setEditingHint(null);
    reload();
    onHintChanged(saved.hint_type_code);
  };

  const handleDeleted = (hint: RegionHintInfo) => {
    reload();
    onHintChanged(hint.hint_type_code);
  };

  const showForm = isAdding || editingHint !== null;

  return (
    <aside className="region-inspector">
      <RegionHeader region={region} />

      <div className="region-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditingHint(null);
            setIsAdding(true);
          }}
        >
          + Add hint
        </button>
        <SelectionActions
          region={region}
          selectedCount={selectedCount}
          onSelectionChange={onSelectionChange}
        />
      </div>

      {showForm && (
        <HintForm
          region={region}
          initialHint={editingHint}
          onCancel={() => {
            setIsAdding(false);
            setEditingHint(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <HintList
        hints={hints}
        loading={loading}
        onEdit={setEditingHint}
        onDeleted={handleDeleted}
      />
    </aside>
  );
}
