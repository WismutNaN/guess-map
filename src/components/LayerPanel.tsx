import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_COVERAGE_OPACITY } from "../map/layers/coverage";
import { DEFAULT_FLAG_SIZE_SCALE } from "../map/layers/flags";
import { isOverlayManagedHintType, OVERLAY_LAYERS } from "../map/overlays";
import type { HintTypeInfo } from "../types";
import { HintSection } from "./layers/HintSection";
import { OverlaySection } from "./layers/OverlaySection";
import { emitVisibilityState, mergeLayerVisibility } from "./layers/visibility";

interface LayerPanelProps {
  onToggle: (code: string, visible: boolean) => void;
  refreshSignal?: number;
  coverageOpacity?: number;
  onCoverageOpacityChange?: (opacity: number) => void;
  flagSizeScale?: number;
  onFlagSizeScaleChange?: (scale: number) => void;
  minConfidence?: number;
  onMinConfidenceChange?: (value: number) => void;
  emptyFilterHintType?: string;
  onEmptyFilterHintTypeChange?: (hintTypeCode: string) => void;
  showEmptyRegions?: boolean;
  onShowEmptyRegionsChange?: (enabled: boolean) => void;
  routesFilterMode?: "all" | "selected_country";
  selectedCountryCode?: string | null;
  onRoutesFilterModeChange?: (mode: "all" | "selected_country") => void;
}

export function LayerPanel({
  onToggle,
  refreshSignal = 0,
  coverageOpacity = DEFAULT_COVERAGE_OPACITY,
  onCoverageOpacityChange,
  flagSizeScale = DEFAULT_FLAG_SIZE_SCALE,
  onFlagSizeScaleChange,
  minConfidence = 0,
  onMinConfidenceChange,
  emptyFilterHintType = "",
  onEmptyFilterHintTypeChange,
  showEmptyRegions = false,
  onShowEmptyRegionsChange,
  routesFilterMode = "all",
  selectedCountryCode,
  onRoutesFilterModeChange,
}: LayerPanelProps) {
  const [hintTypes, setHintTypes] = useState<HintTypeInfo[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [coverageOpacityLocal, setCoverageOpacityLocal] = useState(
    Math.round(coverageOpacity * 100)
  );
  const [flagSizeLocal, setFlagSizeLocal] = useState(Math.round(flagSizeScale * 100));
  const [minConfidenceLocal, setMinConfidenceLocal] = useState(
    Math.round(minConfidence * 100)
  );
  const [emptyFilterHintTypeLocal, setEmptyFilterHintTypeLocal] =
    useState(emptyFilterHintType);
  const [showEmptyRegionsLocal, setShowEmptyRegionsLocal] = useState(showEmptyRegions);

  useEffect(() => {
    setCoverageOpacityLocal(Math.round(coverageOpacity * 100));
  }, [coverageOpacity]);

  useEffect(() => {
    setFlagSizeLocal(Math.round(flagSizeScale * 100));
  }, [flagSizeScale]);

  useEffect(() => {
    setMinConfidenceLocal(Math.round(minConfidence * 100));
  }, [minConfidence]);

  useEffect(() => {
    setEmptyFilterHintTypeLocal(emptyFilterHintType);
  }, [emptyFilterHintType]);

  useEffect(() => {
    setShowEmptyRegionsLocal(showEmptyRegions);
  }, [showEmptyRegions]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      invoke<HintTypeInfo[]>("get_hint_types"),
      invoke<Record<string, number>>("get_hint_counts"),
    ]).then(([types, c]) => {
      if (cancelled) return;
      // Some hint types are rendered via dedicated overlay groups/UI (coverage, routes),
      // so they must not appear in the generic hint toggle list.
      const activeTypes = types.filter(
        (t) =>
          t.is_active &&
          t.display_family !== "line" &&
          !isOverlayManagedHintType(t.code)
      );
      setHintTypes(activeTypes);
      setCounts(c);
      setVisibility((prev) => {
        const next = mergeLayerVisibility(prev, OVERLAY_LAYERS, activeTypes, c);
        emitVisibilityState(onToggle, OVERLAY_LAYERS, activeTypes, next);
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

  const handleCoverageOpacityChange = (value: number) => {
    setCoverageOpacityLocal(value);
    onCoverageOpacityChange?.(value / 100);
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
          <OverlaySection
            visibility={visibility}
            coverageOpacityPercent={coverageOpacityLocal}
            routesFilterMode={routesFilterMode}
            selectedCountryCode={selectedCountryCode}
            onToggle={handleToggle}
            onCoverageOpacityChange={handleCoverageOpacityChange}
            onRoutesFilterModeChange={(mode) => onRoutesFilterModeChange?.(mode)}
          />
          <HintSection
            hintTypes={hintTypes}
            counts={counts}
            visibility={visibility}
            onToggle={handleToggle}
          />
          <div className="layer-section-label">Filters</div>
          <div className="overlay-filter-block">
            <label className="overlay-filter-checkbox">
              <input
                type="checkbox"
                checked={showEmptyRegionsLocal}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setShowEmptyRegionsLocal(enabled);
                  onShowEmptyRegionsChange?.(enabled);
                }}
              />
              Empty regions
            </label>
            <select
              className="overlay-filter-select"
              value={emptyFilterHintTypeLocal}
              onChange={(event) => {
                const next = event.target.value;
                setEmptyFilterHintTypeLocal(next);
                onEmptyFilterHintTypeChange?.(next);
              }}
            >
              <option value="">Select hint type</option>
              {hintTypes.map((hintType) => (
                <option key={hintType.id} value={hintType.code}>
                  {hintType.title}
                </option>
              ))}
            </select>
          </div>

          <div className="overlay-slider-block">
            <div className="overlay-slider-label">
              Symbol size
              <span>{flagSizeLocal}%</span>
            </div>
            <input
              className="overlay-slider"
              type="range"
              aria-label="Symbol size"
              min={100}
              max={300}
              step={5}
              value={flagSizeLocal}
              onChange={(event) => {
                const raw = Number.parseInt(event.target.value, 10);
                setFlagSizeLocal(raw);
                onFlagSizeScaleChange?.(raw / 100);
              }}
            />
          </div>

          <div className="overlay-slider-block">
            <div className="overlay-slider-label">
              Min confidence
              <span>{minConfidenceLocal}%</span>
            </div>
            <input
              className="overlay-slider"
              type="range"
              aria-label="Minimum confidence"
              min={0}
              max={100}
              step={1}
              value={minConfidenceLocal}
              onChange={(event) => {
                const raw = Number.parseInt(event.target.value, 10);
                setMinConfidenceLocal(raw);
                onMinConfidenceChange?.(raw / 100);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
