import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { applyMinConfidenceFilter, refreshHintTypeOnMap } from "../map/hintLayers";
import { setLayerGroupVisibility } from "../map/layerManager";
import { DEFAULT_COVERAGE_OPACITY, setCoverageOpacity } from "../map/layers/coverage";
import {
  DEFAULT_GRID_SIZE_SCALE,
  isHintGridCode,
  setHintGridSizeScale,
  setHintGridTypeVisibility,
} from "../map/layers/hintGrid";
import { setRoutesCountryFilter } from "../map/layers/routes";
import { setEmptyRegionFilter } from "../map/layers/regions";
import { applyDebugOverlayOptions } from "../map/debug";
import {
  loadDisplaySettings,
  saveDisplaySettings,
} from "../map/persistence";
import {
  applyDensityPreset,
  DEFAULT_DENSITY_PRESET,
  type DensityPresetId,
} from "../map/presets";
import {
  applyPresentationMode,
  DEFAULT_PRESENTATION_MODE,
  type PresentationMode,
} from "../map/presentation";
import type { EmptyRegionFilterInfo } from "../types";

export type RoutesFilterMode = "all" | "selected_country";

export interface LayerState {
  coverageOpacity: number;
  flagSizeScale: number;
  minConfidence: number;
  densityPreset: DensityPresetId;
  presentationMode: PresentationMode;
  showCollisionBoxes: boolean;
  showTileBoundaries: boolean;
  emptyFilterHintType: string;
  showEmptyRegions: boolean;
  routesFilterMode: RoutesFilterMode;
  /** Incremented when layer data changes — triggers LayerPanel refresh */
  refreshSignal: number;
  /** Incremented on any data mutation — triggers ChangeLog refresh */
  revisionSignal: number;

  setCoverageOpacity: (opacity: number) => void;
  setFlagSizeScale: (scale: number) => void;
  setMinConfidence: (value: number) => void;
  setDensityPreset: (preset: DensityPresetId) => void;
  setPresentationMode: (mode: PresentationMode) => void;
  setShowCollisionBoxes: (enabled: boolean) => void;
  setShowTileBoundaries: (enabled: boolean) => void;
  setEmptyFilterHintType: (code: string) => void;
  setShowEmptyRegions: (enabled: boolean) => void;
  setRoutesFilterMode: (mode: RoutesFilterMode) => void;
  toggleLayer: (code: string, visible: boolean) => void;

  /** Call after a hint is created/updated/deleted to refresh the map layer */
  onHintChanged: (hintTypeCode: string) => void;
  /** Initialize map-dependent layer state (call once on map ready) */
  initMap: (map: maplibregl.Map) => void;
  /** Bind to selectedCountryCode changes for routes filter */
  syncRoutesFilter: (countryCode: string | null) => void;
  /** Clear stored map reference (e.g. when map view is unmounted) */
  clearMap: () => void;
}

export function useLayerState(): LayerState {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [coverageOpacity, setCoverageOpacityVal] = useState(DEFAULT_COVERAGE_OPACITY);
  const [flagSizeScale, setFlagSizeScaleVal] = useState(DEFAULT_GRID_SIZE_SCALE);
  const [minConfidence, setMinConfidenceVal] = useState(0);
  const [densityPreset, setDensityPreset] = useState<DensityPresetId>(
    DEFAULT_DENSITY_PRESET
  );
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(
    DEFAULT_PRESENTATION_MODE
  );
  const [showCollisionBoxes, setShowCollisionBoxes] = useState(false);
  const [showTileBoundaries, setShowTileBoundaries] = useState(false);
  const [displaySettingsLoaded, setDisplaySettingsLoaded] = useState(false);
  const [emptyFilterHintType, setEmptyFilterHintType] = useState("");
  const [showEmptyRegions, setShowEmptyRegions] = useState(false);
  const [routesFilterMode, setRoutesFilterMode] = useState<RoutesFilterMode>("all");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [revisionSignal, setRevisionSignal] = useState(0);

  // Keep refs for values needed in callbacks
  const routesFilterModeRef = useRef(routesFilterMode);
  routesFilterModeRef.current = routesFilterMode;

  const bumpRefresh = useCallback(() => {
    setRefreshSignal((v) => v + 1);
    setRevisionSignal((v) => v + 1);
  }, []);

  const applyDisplaySettingsToMap = useCallback(
    (map: maplibregl.Map) => {
      applyDensityPreset(map, densityPreset);
      applyPresentationMode(map, presentationMode, densityPreset);
      applyDebugOverlayOptions(map, {
        showCollisionBoxes,
        showTileBoundaries,
      });
    },
    [densityPreset, presentationMode, showCollisionBoxes, showTileBoundaries]
  );

  const toggleLayer = useCallback((code: string, visible: boolean) => {
    if (mapRef.current) {
      setLayerGroupVisibility(mapRef.current, code, visible);
      if (isHintGridCode(mapRef.current, code)) {
        setHintGridTypeVisibility(mapRef.current, code, visible);
      }
      applyDisplaySettingsToMap(mapRef.current);
    }
  }, [applyDisplaySettingsToMap]);

  const handleCoverageOpacity = useCallback((opacity: number) => {
    setCoverageOpacityVal(opacity);
    if (mapRef.current) setCoverageOpacity(mapRef.current, opacity);
  }, []);

  const handleFlagSizeScale = useCallback((scale: number) => {
    setFlagSizeScaleVal(scale);
    if (!mapRef.current) return;
    setHintGridSizeScale(mapRef.current, scale);
  }, []);

  const onHintChanged = useCallback(
    (hintTypeCode: string) => {
      const map = mapRef.current;
      if (map) {
        void refreshHintTypeOnMap(map, hintTypeCode).catch((err) =>
          console.error("Failed to refresh hint layer:", err)
        );
        applyDisplaySettingsToMap(map);
      }
      bumpRefresh();
    },
    [applyDisplaySettingsToMap, bumpRefresh]
  );

  const initMap = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      applyMinConfidenceFilter(map, minConfidence);
      setCoverageOpacity(map, coverageOpacity);
      setHintGridSizeScale(map, flagSizeScale);

      applyDisplaySettingsToMap(map);
      setRefreshSignal((v) => v + 1);
    },
    [
      applyDisplaySettingsToMap,
      coverageOpacity,
      flagSizeScale,
      minConfidence,
    ]
  );

  const syncRoutesFilter = useCallback((countryCode: string | null) => {
    if (!mapRef.current) return;
    const filterCountry =
      routesFilterModeRef.current === "selected_country" ? countryCode : null;
    try {
      setRoutesCountryFilter(mapRef.current, filterCountry);
    } catch {
      mapRef.current = null;
    }
  }, []);

  const clearMap = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Sync minConfidence to map
  useEffect(() => {
    if (mapRef.current) applyMinConfidenceFilter(mapRef.current, minConfidence);
  }, [minConfidence]);

  // Load persisted display settings once.
  useEffect(() => {
    let cancelled = false;
    void loadDisplaySettings()
      .then((settings) => {
        if (cancelled) return;
        setDensityPreset(settings.densityPreset);
        setPresentationMode(settings.presentationMode);
        setShowCollisionBoxes(settings.showCollisionBoxes);
        setShowTileBoundaries(settings.showTileBoundaries);
      })
      .finally(() => {
        if (!cancelled) {
          setDisplaySettingsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist display settings.
  useEffect(() => {
    if (!displaySettingsLoaded) return;
    saveDisplaySettings({
      densityPreset,
      presentationMode,
      showCollisionBoxes,
      showTileBoundaries,
    });
  }, [
    densityPreset,
    displaySettingsLoaded,
    presentationMode,
    showCollisionBoxes,
    showTileBoundaries,
  ]);

  // Apply display settings to map.
  useEffect(() => {
    if (!mapRef.current) return;
    applyDisplaySettingsToMap(mapRef.current);
  }, [applyDisplaySettingsToMap]);

  // Sync hint grid size scale to map
  useEffect(() => {
    if (!mapRef.current) return;
    setHintGridSizeScale(mapRef.current, flagSizeScale);
  }, [flagSizeScale]);

  // Sync empty region filter to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showEmptyRegions || !emptyFilterHintType) {
      setEmptyRegionFilter(map, null);
      return;
    }

    let cancelled = false;
    void invoke<EmptyRegionFilterInfo>("get_empty_region_filter", {
      hintTypeCode: emptyFilterHintType,
    })
      .then((info) => {
        if (!cancelled && mapRef.current) setEmptyRegionFilter(mapRef.current, info);
      })
      .catch((err) => console.error("Failed to load empty region filter:", err));

    return () => {
      cancelled = true;
    };
  }, [emptyFilterHintType, showEmptyRegions, refreshSignal]);

  return {
    coverageOpacity,
    flagSizeScale,
    minConfidence,
    densityPreset,
    presentationMode,
    showCollisionBoxes,
    showTileBoundaries,
    emptyFilterHintType,
    showEmptyRegions,
    routesFilterMode,
    refreshSignal,
    revisionSignal,

    setCoverageOpacity: handleCoverageOpacity,
    setFlagSizeScale: handleFlagSizeScale,
    setMinConfidence: setMinConfidenceVal,
    setDensityPreset,
    setPresentationMode,
    setShowCollisionBoxes,
    setShowTileBoundaries,
    setEmptyFilterHintType,
    setShowEmptyRegions,
    setRoutesFilterMode,
    toggleLayer,
    onHintChanged,
    initMap,
    syncRoutesFilter,
    clearMap,
  };
}
