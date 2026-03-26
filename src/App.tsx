import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import maplibregl from "maplibre-gl";
import { ChangeLog } from "./components/ChangeLog";
import { LayerPanel } from "./components/LayerPanel";
import { MapView } from "./components/MapView";
import { RegionInspector } from "./components/RegionInspector";
import { Settings } from "./components/Settings";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { applyMinConfidenceFilter, refreshHintTypeOnMap } from "./map/hintLayers";
import { setLayerGroupVisibility } from "./map/layerManager";
import { DEFAULT_COVERAGE_OPACITY, setCoverageOpacity } from "./map/layers/coverage";
import { setRoutesCountryFilter } from "./map/layers/routes";
import { setEmptyRegionFilter } from "./map/layers/regions";
import type { AppMode, EmptyRegionFilterInfo, RegionInfo } from "./types";
import "./App.css";

interface RegionStats {
  countries: number;
  admin1: number;
  total: number;
}

type RoutesFilterMode = "all" | "selected_country";

interface AgentApiDataChangedEvent {
  hint_type_codes?: string[];
}

function App() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [zoom, setZoom] = useState(2);
  const [mode, setMode] = useState<AppMode>("editor");
  const [selectedRegions, setSelectedRegions] = useState<RegionInfo[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [layerPanelVersion, setLayerPanelVersion] = useState(0);
  const [revisionSignal, setRevisionSignal] = useState(0);
  const [coverageOpacity, setCoverageOpacityState] = useState(DEFAULT_COVERAGE_OPACITY);
  const [minConfidence, setMinConfidence] = useState(0);
  const [emptyFilterHintType, setEmptyFilterHintType] = useState("");
  const [showEmptyRegions, setShowEmptyRegions] = useState(false);
  const [routesFilterMode, setRoutesFilterMode] = useState<RoutesFilterMode>("all");
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    invoke<RegionStats>("get_region_stats")
      .then(setStats)
      .catch(console.error);
  }, []);

  const handleLayerToggle = useCallback((code: string, visible: boolean) => {
    if (mapRef.current) {
      setLayerGroupVisibility(mapRef.current, code, visible);
    }
  }, []);

  const handleCoverageOpacityChange = useCallback((opacity: number) => {
    setCoverageOpacityState(opacity);
    if (mapRef.current) {
      setCoverageOpacity(mapRef.current, opacity);
    }
  }, []);

  const selectedRegion = useMemo(() => {
    if (selectedRegions.length === 0) {
      return null;
    }
    if (activeRegionId) {
      const active = selectedRegions.find((region) => region.id === activeRegionId);
      if (active) {
        return active;
      }
    }
    return selectedRegions[0];
  }, [activeRegionId, selectedRegions]);

  const handleSelectionChange = useCallback((regions: RegionInfo[], activeRegion: RegionInfo | null) => {
    setSelectedRegions(regions);
    if (regions.length === 0) {
      setActiveRegionId(null);
      return;
    }

    if (activeRegion) {
      setActiveRegionId(activeRegion.id);
      return;
    }

    setActiveRegionId((current) => {
      if (current && regions.some((region) => region.id === current)) {
        return current;
      }
      return regions[0].id;
    });
  }, []);

  const selectedCountryCode = selectedRegion?.country_code ?? null;

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    applyMinConfidenceFilter(map, minConfidence);
    setCoverageOpacity(map, coverageOpacity);
    const filterCountry =
      routesFilterMode === "selected_country" ? selectedCountryCode : null;
    setRoutesCountryFilter(map, filterCountry);
    setLayerPanelVersion((version) => version + 1);
  }, [coverageOpacity, minConfidence, routesFilterMode, selectedCountryCode]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    const filterCountry =
      routesFilterMode === "selected_country" ? selectedCountryCode : null;
    setRoutesCountryFilter(mapRef.current, filterCountry);
  }, [routesFilterMode, selectedCountryCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    applyMinConfidenceFilter(map, minConfidence);
  }, [minConfidence]);

  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!showEmptyRegions || !emptyFilterHintType) {
      setEmptyRegionFilter(map, null);
      return;
    }

    void invoke<EmptyRegionFilterInfo>("get_empty_region_filter", {
      hintTypeCode: emptyFilterHintType,
    })
      .then((filterInfo) => {
        if (!cancelled && mapRef.current) {
          setEmptyRegionFilter(mapRef.current, filterInfo);
        }
      })
      .catch((error) => {
        console.error("Failed to load empty region filter:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [emptyFilterHintType, showEmptyRegions, layerPanelVersion]);

  const flyToRegion = useCallback((region: RegionInfo) => {
    const map = mapRef.current;
    const lng = region.anchor_lng;
    const lat = region.anchor_lat;
    if (!map || lng === null || lng === undefined || lat === null || lat === undefined) {
      return;
    }

    map.flyTo({
      center: [lng, lat],
      zoom: region.region_level === "country" ? 4 : 6,
      duration: 700,
    });
  }, []);

  const handleSearchRegionSelect = useCallback(
    (region: RegionInfo) => {
      setSelectedRegions([region]);
      setActiveRegionId(region.id);
      flyToRegion(region);
      if (mode === "study") {
        setMode("editor");
      }
    },
    [flyToRegion, mode]
  );

  const handleHintChanged = useCallback((hintTypeCode: string) => {
    const map = mapRef.current;
    if (map) {
      void refreshHintTypeOnMap(map, hintTypeCode).catch((error) =>
        console.error("Failed to refresh hint layer:", error)
      );
    }
    setLayerPanelVersion((version) => version + 1);
    setRevisionSignal((version) => version + 1);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen<AgentApiDataChangedEvent>("agent-api:data-changed", (event) => {
      const map = mapRef.current;
      if (!map) {
        setLayerPanelVersion((version) => version + 1);
        return;
      }

      const codes = event.payload?.hint_type_codes ?? [];
      for (const code of codes) {
        void refreshHintTypeOnMap(map, code).catch((error) =>
          console.error("Failed to refresh hint layer from agent event:", error)
        );
      }

      setLayerPanelVersion((version) => version + 1);
      setRevisionSignal((version) => version + 1);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        onRegionSelect={handleSearchRegionSelect}
        onToggleHistory={() => setChangeLogOpen((open) => !open)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="map-wrapper">
        <MapView
          editorMode={mode === "editor"}
          selectedRegions={selectedRegions}
          onSelectionChange={handleSelectionChange}
          onZoomChange={setZoom}
          onMapReady={handleMapReady}
        />
      </div>

      <LayerPanel
        onToggle={handleLayerToggle}
        refreshSignal={layerPanelVersion}
        coverageOpacity={coverageOpacity}
        onCoverageOpacityChange={handleCoverageOpacityChange}
        minConfidence={minConfidence}
        onMinConfidenceChange={setMinConfidence}
        emptyFilterHintType={emptyFilterHintType}
        onEmptyFilterHintTypeChange={setEmptyFilterHintType}
        showEmptyRegions={showEmptyRegions}
        onShowEmptyRegionsChange={setShowEmptyRegions}
        selectedCountryCode={selectedCountryCode}
        routesFilterMode={routesFilterMode}
        onRoutesFilterModeChange={setRoutesFilterMode}
      />

      {mode === "editor" && (
        <RegionInspector
          region={selectedRegion}
          selectedRegions={selectedRegions}
          onSelectionChange={handleSelectionChange}
          onHintChanged={handleHintChanged}
        />
      )}

      <ChangeLog
        open={changeLogOpen}
        onClose={() => setChangeLogOpen(false)}
        refreshSignal={revisionSignal}
      />

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <StatusBar stats={stats} zoom={zoom} selectedCount={selectedRegions.length} />
    </div>
  );
}

export default App;
