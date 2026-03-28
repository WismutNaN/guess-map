import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_COVERAGE_OPACITY } from "../map/layers/coverage";
import { isOverlayManagedHintType, OVERLAY_LAYERS } from "../map/overlays";
import {
  loadLayerVisibility,
  saveLayerVisibility,
} from "../map/persistence";
import type { HintTypeInfo } from "../types";
import { HintSection } from "./layers/HintSection";
import { OverlaySection } from "./layers/OverlaySection";
import { emitVisibilityState, mergeLayerVisibility } from "./layers/visibility";

const DEFAULT_SYMBOL_SIZE_SCALE = 1.4;

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
  flagSizeScale = DEFAULT_SYMBOL_SIZE_SCALE,
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
    Math.round(coverageOpacity * 100),
  );
  const [flagSizeLocal, setFlagSizeLocal] = useState(
    Math.round(flagSizeScale * 100),
  );
  const [minConfidenceLocal, setMinConfidenceLocal] = useState(
    Math.round(minConfidence * 100),
  );
  const [emptyFilterHintTypeLocal, setEmptyFilterHintTypeLocal] =
    useState(emptyFilterHintType);
  const [showEmptyRegionsLocal, setShowEmptyRegionsLocal] =
    useState(showEmptyRegions);
  const emptyFilterHintTypes = hintTypes.filter(
    (hintType) => hintType.code !== "region_code",
  );

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

  // Load hint types, counts, and saved visibility on mount / refresh
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      invoke<HintTypeInfo[]>("get_hint_types"),
      invoke<Record<string, number>>("get_hint_counts"),
      loadLayerVisibility(),
    ]).then(([types, c, savedVis]) => {
      if (cancelled) return;
      const activeTypes = types.filter(
        (t) =>
          t.is_active &&
          t.display_family !== "line" &&
          !isOverlayManagedHintType(t.code),
      );
      setHintTypes(activeTypes);
      setCounts(c);
      setVisibility((prev) => {
        const next = mergeLayerVisibility(
          prev,
          OVERLAY_LAYERS,
          activeTypes,
          c,
          savedVis,
        );
        emitVisibilityState(onToggle, OVERLAY_LAYERS, activeTypes, prev, next);
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [onToggle, refreshSignal]);

  // Set a single layer's visibility (used by both individual and group toggles)
  const handleSetVisible = (code: string, visible: boolean) => {
    setVisibility((v) => {
      const updated = { ...v, [code]: visible };
      saveLayerVisibility(updated);
      return updated;
    });
    onToggle(code, visible);
  };

  // Legacy toggle (flip current value)
  const handleToggle = (code: string) => {
    handleSetVisible(code, !visibility[code]);
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
            onRoutesFilterModeChange={(mode) =>
              onRoutesFilterModeChange?.(mode)
            }
          />
          <HintSection
            hintTypes={hintTypes}
            counts={counts}
            visibility={visibility}
            onSetVisible={handleSetVisible}
          />

          {/* --- Display settings --- */}
          <div className="layer-section-label">Display</div>
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

          {/* --- Filters --- */}
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
              {emptyFilterHintTypes.map((hintType) => (
                <option key={hintType.id} value={hintType.code}>
                  {hintType.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
