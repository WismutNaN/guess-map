import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addRegionLayers } from "../map/regionLayers";
import { addCityLayer } from "../map/cityLayer";
import { addDrivingSideLayer, addFlagLayer, setHintLayerVisibility } from "../map/hintLayers";
import { loadMapPosition, saveMapPosition } from "../map/persistence";

interface MapViewProps {
  onZoomChange?: (zoom: number) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

export function MapView({ onZoomChange, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initMap = async () => {
      const saved = await loadMapPosition();

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          sources: {
            "osm-tiles": {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "osm-tiles",
              type: "raster",
              source: "osm-tiles",
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [saved.lng, saved.lat],
        zoom: saved.zoom,
        maxZoom: 18,
        minZoom: 1,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right"
      );

      map.on("load", async () => {
        await addRegionLayers(map);
        // Add hint layers after region layers (they reference the same source)
        try {
          await addDrivingSideLayer(map);
        } catch (e) {
          console.error("Failed to load driving_side layer:", e);
        }
        await addCityLayer(map);
        try {
          await addFlagLayer(map);
        } catch (e) {
          console.error("Failed to load flag layer:", e);
        }
        onMapReady?.(map);
      });

      map.on("zoom", () => {
        onZoomChange?.(map.getZoom());
      });

      // Save position on move end
      map.on("moveend", () => {
        const center = map.getCenter();
        saveMapPosition(center.lng, center.lat, map.getZoom());
      });

      mapRef.current = map;
      onZoomChange?.(map.getZoom());
    };

    initMap();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
}

export { setHintLayerVisibility };
