import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createBaseMapStyle } from "../map/baseStyle";
import { bootstrapMapLayers } from "../map/bootstrapLayers";
import { bindRegionSelection } from "../map/interaction";
import { addSelectionLayers, setSelectedRegions } from "../map/layers";
import { loadMapPosition, saveMapPosition } from "../map/persistence";
import type { RegionInfo } from "../types";

interface MapViewProps {
  editorMode: boolean;
  selectedRegions: RegionInfo[];
  onSelectionChange: (regions: RegionInfo[], activeRegion: RegionInfo | null) => void;
  onZoomChange?: (zoom: number) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

export function MapView({
  editorMode,
  selectedRegions,
  onSelectionChange,
  onZoomChange,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const editorModeRef = useRef(editorMode);
  const selectedRegionsRef = useRef<RegionInfo[]>(selectedRegions);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onMapReadyRef = useRef(onMapReady);
  const unbindSelectionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    selectedRegionsRef.current = selectedRegions;
    if (mapRef.current) {
      setSelectedRegions(mapRef.current, selectedRegions);
    }
  }, [selectedRegions]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initMap = async () => {
      const saved = await loadMapPosition();

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: createBaseMapStyle(),
        center: [saved.lng, saved.lat],
        zoom: saved.zoom,
        maxZoom: 18,
        minZoom: 1,
        boxZoom: false,
        // We add a single compact attribution control manually below.
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right"
      );

      map.on("load", async () => {
        await bootstrapMapLayers(map);

        addSelectionLayers(map);
        setSelectedRegions(map, selectedRegionsRef.current);

        unbindSelectionRef.current = bindRegionSelection(map, {
          isEnabled: () => editorModeRef.current,
          getSelectedRegions: () => selectedRegionsRef.current,
          onSelectionChange: (regions, activeRegion) =>
            onSelectionChangeRef.current(regions, activeRegion),
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
