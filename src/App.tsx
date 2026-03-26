import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { LayerPanel } from "./components/LayerPanel";
import { MapView } from "./components/MapView";
import { RegionInspector } from "./components/RegionInspector";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { refreshHintTypeOnMap } from "./map/hintLayers";
import { setLayerGroupVisibility } from "./map/layerManager";
import type { AppMode, RegionInfo } from "./types";
import "./App.css";

interface RegionStats {
  countries: number;
  admin1: number;
  total: number;
}

function App() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [zoom, setZoom] = useState(2);
  const [mode, setMode] = useState<AppMode>("editor");
  const [selectedRegion, setSelectedRegion] = useState<RegionInfo | null>(null);
  const [layerPanelVersion, setLayerPanelVersion] = useState(0);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    invoke<RegionStats>("get_region_stats")
      .then(setStats)
      .catch(console.error);
  }, []);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    setLayerPanelVersion((version) => version + 1);
  }, []);

  const handleLayerToggle = useCallback((code: string, visible: boolean) => {
    if (mapRef.current) {
      setLayerGroupVisibility(mapRef.current, code, visible);
    }
  }, []);

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
      setSelectedRegion(region);
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
  }, []);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        onRegionSelect={handleSearchRegionSelect}
      />

      <div className="map-wrapper">
        <MapView
          editorMode={mode === "editor"}
          selectedRegion={selectedRegion}
          onRegionSelect={setSelectedRegion}
          onZoomChange={setZoom}
          onMapReady={handleMapReady}
        />
      </div>

      <LayerPanel onToggle={handleLayerToggle} refreshSignal={layerPanelVersion} />

      {mode === "editor" && (
        <RegionInspector
          region={selectedRegion}
          onDeselect={() => setSelectedRegion(null)}
          onHintChanged={handleHintChanged}
        />
      )}

      <StatusBar stats={stats} zoom={zoom} />
    </div>
  );
}

export default App;
