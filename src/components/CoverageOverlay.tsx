import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type maplibregl from "maplibre-gl";

interface CoverageOverlayProps {
  /** The MapLibre map to synchronize with */
  map: maplibregl.Map | null;
  /** Whether the coverage layer is visible */
  visible: boolean;
  /** Tile opacity 0–1 */
  opacity?: number;
}

/**
 * Google Street View coverage overlay using Leaflet.
 *
 * Leaflet loads tiles as <img> DOM elements — no CORS or WebGL needed.
 * The Leaflet map is positioned absolutely over the MapLibre canvas,
 * with pointer-events disabled so all interactions pass through.
 * Position/zoom are synced from MapLibre → Leaflet on every move.
 */
export function CoverageOverlay({
  map,
  visible,
  opacity = 0.7,
}: CoverageOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Leaflet map (once)
  useEffect(() => {
    if (!containerRef.current || leafletMapRef.current) return;

    const lmap = L.map(containerRef.current, {
      // Disable all Leaflet interaction — MapLibre handles it
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      // Match MapLibre's initial view (will be synced)
      center: [0, 0],
      zoom: 2,
      // Support fractional zoom to match MapLibre precisely
      zoomSnap: 0,
      zoomDelta: 0,
    });

    // Google Street View coverage tiles
    // Rotate across mts0-3 servers using {s} subdomain
    const tileLayer = L.tileLayer(
      "https://mts{s}.google.com/vt?hl=en-US&lyrs=svv&x={x}&y={y}&z={z}",
      {
        subdomains: ["0", "1", "2", "3"],
        maxZoom: 21,
        opacity,
        // Don't add attribution to the overlay
        attribution: "",
      }
    );
    tileLayer.addTo(lmap);

    leafletMapRef.current = lmap;
    tileLayerRef.current = tileLayer;

    return () => {
      lmap.remove();
      leafletMapRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Sync MapLibre → Leaflet on every move
  useEffect(() => {
    if (!map) return;

    const syncView = () => {
      const lmap = leafletMapRef.current;
      if (!lmap) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      lmap.setView([center.lat, center.lng], zoom, { animate: false });
    };

    // Initial sync
    syncView();

    // Listen for all movement events
    map.on("move", syncView);
    map.on("zoom", syncView);
    map.on("resize", syncView);

    // Also invalidate Leaflet size when MapLibre resizes
    const handleResize = () => {
      leafletMapRef.current?.invalidateSize({ animate: false });
      syncView();
    };
    map.on("resize", handleResize);

    return () => {
      map.off("move", syncView);
      map.off("zoom", syncView);
      map.off("resize", syncView);
      map.off("resize", handleResize);
    };
  }, [map]);

  // Update visibility
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.display = visible ? "block" : "none";
    }
    // Invalidate size when showing — Leaflet needs correct container dimensions
    if (visible && leafletMapRef.current) {
      leafletMapRef.current.invalidateSize({ animate: false });

      // Re-sync view when becoming visible
      if (map) {
        const center = map.getCenter();
        leafletMapRef.current.setView(
          [center.lat, center.lng],
          map.getZoom(),
          { animate: false }
        );
      }
    }
  }, [visible, map]);

  // Update opacity
  useEffect(() => {
    tileLayerRef.current?.setOpacity(opacity);
  }, [opacity]);

  return (
    <div
      ref={containerRef}
      className="coverage-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        display: visible ? "block" : "none",
      }}
    />
  );
}
