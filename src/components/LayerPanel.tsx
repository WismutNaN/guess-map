import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HintTypeInfo } from "../types";

interface LayerPanelProps {
  onToggle: (code: string, visible: boolean) => void;
  refreshSignal?: number;
}

export function LayerPanel({ onToggle, refreshSignal = 0 }: LayerPanelProps) {
  const [hintTypes, setHintTypes] = useState<HintTypeInfo[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      invoke<HintTypeInfo[]>("get_hint_types"),
      invoke<Record<string, number>>("get_hint_counts"),
    ]).then(([types, c]) => {
      if (cancelled) return;
      const activeTypes = types.filter((t) => t.is_active);
      setHintTypes(activeTypes);
      setCounts(c);
      setVisibility((prev) => {
        const next: Record<string, boolean> = {};
        for (const t of activeTypes) {
          next[t.code] = prev[t.code] ?? (c[t.code] ?? 0) > 0;
        }
        for (const t of activeTypes) {
          onToggle(t.code, next[t.code]);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [onToggle, refreshSignal]);

  const handleToggle = (code: string) => {
    const next = !visibility[code];
    setVisibility((v) => ({ ...v, [code]: next }));
    onToggle(code, next);
  };

  if (hintTypes.length === 0) return null;

  return (
    <div className="layer-panel">
      <div
        className="layer-panel-header"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="layer-panel-title">Layers</span>
        <span className="layer-panel-toggle">{collapsed ? "+" : "-"}</span>
      </div>
      {!collapsed && (
        <div className="layer-panel-body">
          {hintTypes.map((ht) => {
            const count = counts[ht.code] ?? 0;
            const hasData = count > 0;
            return (
              <label
                key={ht.code}
                className={`layer-item${!hasData ? " layer-item-empty" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={visibility[ht.code] ?? false}
                  disabled={!hasData && !(visibility[ht.code] ?? false)}
                  onChange={() => handleToggle(ht.code)}
                />
                <span className="layer-item-title">{ht.title}</span>
                <span className="layer-item-count">
                  {hasData ? count : "--"}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
