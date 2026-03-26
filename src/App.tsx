import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import maplibregl from "maplibre-gl";
import { useLayerState } from "./hooks/useLayerState";
import { useSelectionState } from "./hooks/useSelectionState";
import { refreshHintTypeOnMap } from "./map/hintLayers";
import { setRoutesCountryFilter } from "./map/layers/routes";
import { BulkActions } from "./components/BulkActions";
import { ChangeLog } from "./components/ChangeLog";
import { DebugPanel } from "./components/DebugPanel";
import { LayerPanel } from "./components/LayerPanel";
import { MapView } from "./components/MapView";
import { RegionInspector } from "./components/RegionInspector";
import { Settings } from "./components/Settings";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import type { AppMode, RegionInfo } from "./types";
import "./App.css";

interface RegionStats {
  countries: number;
  admin1: number;
  total: number;
}

interface AgentApiDataChangedEvent {
  hint_type_codes?: string[];
}

function App() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [zoom, setZoom] = useState(2);
  const [mode, setMode] = useState<AppMode>("editor");
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selection = useSelectionState();
  const layers = useLayerState();
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Load region stats once
  useEffect(() => {
    invoke<RegionStats>("get_region_stats").then(setStats).catch(console.error);
  }, []);

  // Sync routes filter when selected country changes
  useEffect(() => {
    layers.syncRoutesFilter(selection.selectedCountryCode);
  }, [layers, selection.selectedCountryCode]);

  // Handle map ready
  const handleMapReady = useCallback(
    (map: maplibregl.Map) => {
      mapRef.current = map;
      layers.initMap(map);

      const filterCountry =
        layers.routesFilterMode === "selected_country"
          ? selection.selectedCountryCode
          : null;
      setRoutesCountryFilter(map, filterCountry);
    },
    [layers, selection.selectedCountryCode]
  );

  // Fly to region on search select
  const flyToRegion = useCallback((region: RegionInfo) => {
    const map = mapRef.current;
    const lng = region.anchor_lng;
    const lat = region.anchor_lat;
    if (!map || lng == null || lat == null) return;
    map.flyTo({
      center: [lng, lat],
      zoom: region.region_level === "country" ? 4 : 6,
      duration: 700,
    });
  }, []);

  const handleSearchRegionSelect = useCallback(
    (region: RegionInfo) => {
      selection.setSelection([region], region);
      flyToRegion(region);
      if (mode === "study") setMode("editor");
    },
    [flyToRegion, mode, selection]
  );

  // Listen for Agent API data changes
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen<AgentApiDataChangedEvent>("agent-api:data-changed", (event) => {
      const map = mapRef.current;
      const codes = event.payload?.hint_type_codes ?? [];
      if (map) {
        for (const code of codes) {
          void refreshHintTypeOnMap(map, code).catch(console.error);
        }
      }
      layers.onHintChanged(codes[0] ?? "");
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => unlisten?.();
  }, [layers]);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        onRegionSelect={handleSearchRegionSelect}
        onToggleHistory={() => setChangeLogOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
        densityPreset={layers.densityPreset}
        onDensityPresetChange={layers.setDensityPreset}
        presentationMode={layers.presentationMode}
        onPresentationModeChange={layers.setPresentationMode}
      />

      <div className="map-wrapper">
        <MapView
          editorMode={mode === "editor"}
          selectedRegions={selection.regions}
          onSelectionChange={selection.setSelection}
          onZoomChange={setZoom}
          onMapReady={handleMapReady}
        />
      </div>

      <LayerPanel
        onToggle={layers.toggleLayer}
        refreshSignal={layers.refreshSignal}
        coverageOpacity={layers.coverageOpacity}
        onCoverageOpacityChange={layers.setCoverageOpacity}
        flagSizeScale={layers.flagSizeScale}
        onFlagSizeScaleChange={layers.setFlagSizeScale}
        minConfidence={layers.minConfidence}
        onMinConfidenceChange={layers.setMinConfidence}
        emptyFilterHintType={layers.emptyFilterHintType}
        onEmptyFilterHintTypeChange={layers.setEmptyFilterHintType}
        showEmptyRegions={layers.showEmptyRegions}
        onShowEmptyRegionsChange={layers.setShowEmptyRegions}
        selectedCountryCode={selection.selectedCountryCode}
        routesFilterMode={layers.routesFilterMode}
        onRoutesFilterModeChange={layers.setRoutesFilterMode}
      />
      <DebugPanel
        showCollisionBoxes={layers.showCollisionBoxes}
        showTileBoundaries={layers.showTileBoundaries}
        onShowCollisionBoxesChange={layers.setShowCollisionBoxes}
        onShowTileBoundariesChange={layers.setShowTileBoundaries}
      />

      {mode === "editor" && (
        <RegionInspector
          region={selection.activeRegion}
          selectedCount={selection.regions.length}
          onSelectionChange={selection.setSelection}
          onHintChanged={layers.onHintChanged}
        />
      )}

      {mode === "editor" && (
        <BulkActions
          selectedRegions={selection.regions}
          onClearSelection={selection.clearSelection}
          onHintChanged={layers.onHintChanged}
        />
      )}

      <ChangeLog
        open={changeLogOpen}
        onClose={() => setChangeLogOpen(false)}
        refreshSignal={layers.revisionSignal}
      />

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <StatusBar
        stats={stats}
        zoom={zoom}
        selectedCount={selection.regions.length}
      />
    </div>
  );
}

export default App;
