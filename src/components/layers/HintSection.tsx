import { useCallback, useRef, useState } from "react";
import type { HintTypeInfo } from "../../types";
import { LAYER_GROUPS, isGroupedCode } from "./layerGroups";

interface HintSectionProps {
  hintTypes: HintTypeInfo[];
  counts: Record<string, number>;
  visibility: Record<string, boolean>;
  onSetVisible: (code: string, visible: boolean) => void;
}

// ---------------------------------------------------------------------------
// Single layer item
// ---------------------------------------------------------------------------

function LayerItem({
  hintType,
  count,
  visible,
  disabled,
  onToggle,
}: {
  hintType: HintTypeInfo;
  count: number;
  visible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const hasData = count > 0;
  return (
    <label
      className={`layer-item${!hasData ? " layer-item-empty" : ""}`}
    >
      <input
        type="checkbox"
        checked={visible}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="layer-item-title">{hintType.title}</span>
      <span className="layer-item-count">{hasData ? count : "--"}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Collapsible group
// ---------------------------------------------------------------------------

type GroupCheckState = "all" | "none" | "mixed";

function groupCheckState(
  codes: string[],
  counts: Record<string, number>,
  visibility: Record<string, boolean>,
): GroupCheckState {
  let on = 0;
  let total = 0;
  for (const code of codes) {
    if ((counts[code] ?? 0) > 0) {
      total++;
      if (visibility[code]) on++;
    }
  }
  if (total === 0) return "none";
  if (on === total) return "all";
  if (on === 0) return "none";
  return "mixed";
}

function LayerGroup({
  group,
  hintTypes,
  counts,
  visibility,
  collapsed,
  onToggleCollapse,
  onSetVisible,
}: {
  group: (typeof LAYER_GROUPS)[number];
  hintTypes: HintTypeInfo[];
  counts: Record<string, number>;
  visibility: Record<string, boolean>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSetVisible: (code: string, visible: boolean) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const items = group.codes
    .map((code) => hintTypes.find((t) => t.code === code))
    .filter((t): t is HintTypeInfo => t != null);

  if (items.length === 0) return null;

  const state = groupCheckState(group.codes, counts, visibility);
  const checked = state === "all";
  const indeterminate = state === "mixed";

  // Sync indeterminate (can't be set via JSX)
  if (checkboxRef.current) {
    checkboxRef.current.indeterminate = indeterminate;
  }

  const handleGroupToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = state !== "all";
    for (const code of group.codes) {
      if ((counts[code] ?? 0) > 0 && visibility[code] !== target) {
        onSetVisible(code, target);
      }
    }
  };

  const totalCount = group.codes.reduce(
    (sum, code) => sum + (counts[code] ?? 0),
    0,
  );

  return (
    <div className="layer-group">
      <div className="layer-group-header" onClick={onToggleCollapse}>
        <span
          className={`layer-group-arrow${collapsed ? "" : " expanded"}`}
        >
          ▸
        </span>
        <input
          ref={checkboxRef}
          type="checkbox"
          className="layer-group-checkbox"
          checked={checked}
          onChange={() => {}}
          onClick={handleGroupToggle}
        />
        <span className="layer-group-label">{group.label}</span>
        {totalCount > 0 && (
          <span className="layer-group-count">{totalCount}</span>
        )}
      </div>
      {!collapsed && (
        <div className="layer-group-body">
          {items.map((ht) => {
            const count = counts[ht.code] ?? 0;
            const vis = visibility[ht.code] ?? false;
            return (
              <LayerItem
                key={ht.code}
                hintType={ht}
                count={count}
                visible={vis}
                disabled={count === 0 && !vis}
                onToggle={() => onSetVisible(ht.code, !vis)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function HintSection({
  hintTypes,
  counts,
  visibility,
  onSetVisible,
}: HintSectionProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >(() => {
    // Start with non-essential groups collapsed
    const initial: Record<string, boolean> = {};
    for (const group of LAYER_GROUPS) {
      initial[group.id] = !group.defaultOn;
    }
    return initial;
  });

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  }, []);

  // Collect ungrouped types
  const ungrouped = hintTypes.filter((t) => !isGroupedCode(t.code));

  return (
    <>
      <div className="layer-section-label">Layers</div>
      {LAYER_GROUPS.map((group) => (
        <LayerGroup
          key={group.id}
          group={group}
          hintTypes={hintTypes}
          counts={counts}
          visibility={visibility}
          collapsed={collapsedGroups[group.id] ?? false}
          onToggleCollapse={() => toggleCollapse(group.id)}
          onSetVisible={onSetVisible}
        />
      ))}
      {ungrouped.length > 0 && (
        <>
          <div className="layer-section-label layer-section-label-sub">
            Other
          </div>
          {ungrouped.map((ht) => {
            const count = counts[ht.code] ?? 0;
            const vis = visibility[ht.code] ?? false;
            return (
              <LayerItem
                key={ht.code}
                hintType={ht}
                count={count}
                visible={vis}
                disabled={count === 0 && !vis}
                onToggle={() => onSetVisible(ht.code, !vis)}
              />
            );
          })}
        </>
      )}
    </>
  );
}
