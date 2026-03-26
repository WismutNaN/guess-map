import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { applyMinConfidenceFilter, refreshHintTypeOnMap } from "../map/hintLayers";
import { setLayerGroupVisibility } from "../map/layerManager";
import { DEFAULT_COVERAGE_OPACITY, setCoverageOpacity } from "../map/layers/coverage";
import {
  DEFAULT_FLAG_SIZE_SCALE,
  setFlagSizeScale,
} from "../map/layers/flags";
import { setRoutesCountryFilter } from "../map/layers/routes";
import { setEmptyRegionFilter } from "../map/layers/regions";
import type { EmptyRegionFilterInfo } from "../types";

export type RoutesFilterMode = "all" | "selected_country";

export interface LayerState {
  coverageOpacity: number;
  flagSizeScale: number;
  minConfidence: number;
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
}

export function useLayerState(): LayerState {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [coverageOpacity, setCoverageOpacityVal] = useState(DEFAULT_COVERAGE_OPACITY);
  const [flagSizeScale, setFlagSizeScaleVal] = useState(DEFAULT_FLAG_SIZE_SCALE);
  const [minConfidence, setMinConfidenceVal] = useState(0);
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

  const toggleLayer = useCallback((code: string, visible: boolean) => {
    if (mapRef.current) {
      setLayerGroupVisibility(mapRef.current, code, visible);
    }
  }, []);

  const handleCoverageOpacity = useCallback((opacity: number) => {
    setCoverageOpacityVal(opacity);
    if (mapRef.current) setCoverageOpacity(mapRef.current, opacity);
  }, []);

  const handleFlagSizeScale = useCallback((scale: number) => {
    setFlagSizeScaleVal(scale);
    if (mapRef.current) setFlagSizeScale(mapRef.current, scale);
  }, []);

  const onHintChanged = useCallback(
    (hintTypeCode: string) => {
      const map = mapRef.current;
      if (map) {
        void refreshHintTypeOnMap(map, hintTypeCode).catch((err) =>
          console.error("Failed to refresh hint layer:", err)
        );
      }
      bumpRefresh();
    },
    [bumpRefresh]
  );

  const initMap = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      applyMinConfidenceFilter(map, minConfidence);
      setCoverageOpacity(map, coverageOpacity);
      setFlagSizeScale(map, flagSizeScale);
      setRefreshSignal((v) => v + 1);
    },
    // Intentionally capture initial values only — sync effects handle updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const syncRoutesFilter = useCallback((countryCode: string | null) => {
    if (!mapRef.current) return;
    const filterCountry =
      routesFilterModeRef.current === "selected_country" ? countryCode : null;
    setRoutesCountryFilter(mapRef.current, filterCountry);
  }, []);

  // Sync minConfidence to map
  useEffect(() => {
    if (mapRef.current) applyMinConfidenceFilter(mapRef.current, minConfidence);
  }, [minConfidence]);

  // Sync flag icon size to map
  useEffect(() => {
    if (mapRef.current) setFlagSizeScale(mapRef.current, flagSizeScale);
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
    emptyFilterHintType,
    showEmptyRegions,
    routesFilterMode,
    refreshSignal,
    revisionSignal,

    setCoverageOpacity: handleCoverageOpacity,
    setFlagSizeScale: handleFlagSizeScale,
    setMinConfidence: setMinConfidenceVal,
    setEmptyFilterHintType,
    setShowEmptyRegions,
    setRoutesFilterMode,
    toggleLayer,
    onHintChanged,
    initMap,
    syncRoutesFilter,
  };
}
