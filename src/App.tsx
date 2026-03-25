import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MapView } from "./components/MapView";
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

  useEffect(() => {
    invoke<RegionStats>("get_region_stats")
      .then(setStats)
      .catch(console.error);
  }, []);

  return (
    <div className="app">
      <MapView onZoomChange={setZoom} />
      <StatusBar stats={stats} zoom={zoom} />
    </div>
  );
}

export default App;
