import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import { MapView, setHintLayerVisibility } from "./components/MapView";
import { LayerPanel } from "./components/LayerPanel";
import { StatusBar } from "./components/StatusBar";
import "./App.css";

interface RegionStats {
  countries: number;
  admin1: number;
  total: number;
}

function App() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [zoom, setZoom] = useState(2);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    invoke<RegionStats>("get_region_stats")
      .then(setStats)
      .catch(console.error);
  }, []);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapInstanceRef.current = map;
  }, []);

  const handleLayerToggle = useCallback((code: string, visible: boolean) => {
    if (mapInstanceRef.current) {
      setHintLayerVisibility(mapInstanceRef.current, code, visible);
    }
  }, []);

  return (
    <div className="app">
      <MapView onZoomChange={setZoom} onMapReady={handleMapReady} />
      <LayerPanel onToggle={handleLayerToggle} />
      <StatusBar stats={stats} zoom={zoom} />
    </div>
  );
}

export default App;
