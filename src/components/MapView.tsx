import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  addCityLayers,
  addDrivingSideLayer,
  addFlagLayer,
  addNoteLayer,
  addRegionLayers,
  addSelectionLayers,
  setSelectedRegion,
} from "../map/layers";
import { bindRegionSelection } from "../map/interaction";
import { loadMapPosition, saveMapPosition } from "../map/persistence";
import type { RegionInfo } from "../types";

interface MapViewProps {
  editorMode: boolean;
  selectedRegion: RegionInfo | null;
  onRegionSelect: (region: RegionInfo | null) => void;
  onZoomChange?: (zoom: number) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

export function MapView({
  editorMode,
  selectedRegion,
  onRegionSelect,
  onZoomChange,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const editorModeRef = useRef(editorMode);
  const selectedRegionRef = useRef<RegionInfo | null>(selectedRegion);
  const onRegionSelectRef = useRef(onRegionSelect);
  const onZoomChangeRef = useRef(onZoomChange);
  const onMapReadyRef = useRef(onMapReady);
  const unbindSelectionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    onRegionSelectRef.current = onRegionSelect;
  }, [onRegionSelect]);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
    if (mapRef.current) {
      setSelectedRegion(mapRef.current, selectedRegion);
    }
  }, [selectedRegion]);

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
        await addDrivingSideLayer(map).catch((error) =>
          console.error("Failed to load driving_side layer:", error)
        );
        await addCityLayers(map);
        await addFlagLayer(map).catch((error) =>
          console.error("Failed to load flag layer:", error)
        );
        await addNoteLayer(map).catch((error) =>
          console.error("Failed to load note layer:", error)
        );

        addSelectionLayers(map);
        setSelectedRegion(map, selectedRegionRef.current);

        unbindSelectionRef.current = bindRegionSelection(map, {
          isEnabled: () => editorModeRef.current,
          onRegionSelected: (region) => onRegionSelectRef.current(region),
        });

        onMapReadyRef.current?.(map);
      });

      map.on("zoom", () => onZoomChangeRef.current?.(map.getZoom()));
      map.on("moveend", () => {
        const { lng, lat } = map.getCenter();
        saveMapPosition(lng, lat, map.getZoom());
      });

      mapRef.current = map;
      onZoomChangeRef.current?.(map.getZoom());
    };

    void initMap();

    return () => {
      unbindSelectionRef.current?.();
      unbindSelectionRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
}
