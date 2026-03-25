import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface HintTypeInfo {
  id: string;
  code: string;
  title: string;
  display_family: string;
  sort_order: number;
  is_active: boolean;
}

interface LayerPanelProps {
  onToggle: (code: string, visible: boolean) => void;
}

export function LayerPanel({ onToggle }: LayerPanelProps) {
  const [hintTypes, setHintTypes] = useState<HintTypeInfo[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<HintTypeInfo[]>("get_hint_types"),
      invoke<Record<string, number>>("get_hint_counts"),
    ]).then(([types, c]) => {
      setHintTypes(types.filter((t) => t.is_active));
      setCounts(c);
      // Default: show types that have data
      const vis: Record<string, boolean> = {};
      for (const t of types) {
        vis[t.code] = (c[t.code] ?? 0) > 0;
      }
      setVisibility(vis);
    });
  }, []);

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
                  disabled={!hasData}
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
