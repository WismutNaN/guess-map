import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { RegionInfo } from "../types";

const INTERACTIVE_LAYERS = ["region-admin1-hit", "region-country-fill"] as const;
const LASSO_MIN_DRAG_PIXELS = 4;

interface ResolvePayload {
  regionLevel: "country" | "admin1";
  countryCode?: string;
  geometryRef?: string;
  name?: string;
}

interface RegionInteractionOptions {
  isEnabled: () => boolean;
  getSelectedRegions: () => RegionInfo[];
  onSelectionChange: (regions: RegionInfo[], activeRegion: RegionInfo | null) => void;
}

type Point = { x: number; y: number };

export function bindRegionSelection(
  map: maplibregl.Map,
  options: RegionInteractionOptions
) {
  const container = map.getCanvasContainer();
  let lassoStart: Point | null = null;
  let lassoBox: HTMLDivElement | null = null;
  let suppressNextClick = false;

  const cleanupLasso = () => {
    if (lassoBox) {
      lassoBox.remove();
      lassoBox = null;
    }
    lassoStart = null;
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
  };

  const onClick = (event: maplibregl.MapMouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!options.isEnabled()) {
      return;
    }

    const interactiveLayers = getInteractiveLayers(map);
    if (interactiveLayers.length === 0) {
      return;
    }

    const withModifier = event.originalEvent.ctrlKey || event.originalEvent.metaKey;
    const features = map.queryRenderedFeatures(event.point, {
      layers: interactiveLayers,
    });

    if (features.length === 0) {
      if (!withModifier) {
        options.onSelectionChange([], null);
      }
      return;
    }

    const payload = buildResolvePayload(features[0]);
    if (!payload) {
      if (!withModifier) {
        options.onSelectionChange([], null);
      }
      return;
    }

    void resolveRegion(payload)
      .then((region) => {
        const selection = options.getSelectedRegions();
        if (!region) {
          if (!withModifier) {
            options.onSelectionChange([], null);
          }
          return;
        }

        if (withModifier) {
          const exists = selection.some((selected) => selected.id === region.id);
          const next = exists
            ? selection.filter((selected) => selected.id !== region.id)
            : [...selection, region];
          const nextActive =
            exists && next.length > 0 ? next[next.length - 1] : exists ? null : region;
          options.onSelectionChange(next, nextActive);
          return;
        }

        options.onSelectionChange([region], region);
      })
      .catch((error) => {
        console.error("Failed to resolve clicked region:", error);
      });
  };

  const onMouseDown = (event: maplibregl.MapMouseEvent) => {
    if (!options.isEnabled()) {
      return;
    }
    if (event.originalEvent.button !== 0 || !event.originalEvent.shiftKey) {
      return;
    }

    lassoStart = { x: event.point.x, y: event.point.y };
    lassoBox = document.createElement("div");
    lassoBox.className = "map-lasso-box";
    lassoBox.style.left = `${lassoStart.x}px`;
    lassoBox.style.top = `${lassoStart.y}px`;
    lassoBox.style.width = "0px";
    lassoBox.style.height = "0px";
    container.appendChild(lassoBox);

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    const onMove = (moveEvent: MouseEvent) => {
      if (!lassoStart || !lassoBox) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const y = moveEvent.clientY - rect.top;
      const minX = Math.min(lassoStart.x, x);
      const minY = Math.min(lassoStart.y, y);
      const width = Math.abs(lassoStart.x - x);
      const height = Math.abs(lassoStart.y - y);
      lassoBox.style.left = `${minX}px`;
      lassoBox.style.top = `${minY}px`;
      lassoBox.style.width = `${width}px`;
      lassoBox.style.height = `${height}px`;
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      if (!lassoStart) {
        cleanupLasso();
        return;
      }

      const rect = container.getBoundingClientRect();
      const endX = upEvent.clientX - rect.left;
      const endY = upEvent.clientY - rect.top;
      const minX = Math.min(lassoStart.x, endX);
      const minY = Math.min(lassoStart.y, endY);
      const maxX = Math.max(lassoStart.x, endX);
      const maxY = Math.max(lassoStart.y, endY);

      if (
        Math.abs(maxX - minX) < LASSO_MIN_DRAG_PIXELS &&
        Math.abs(maxY - minY) < LASSO_MIN_DRAG_PIXELS
      ) {
        cleanupLasso();
        return;
      }

      const bbox: [[number, number], [number, number]] = [
        [minX, minY],
        [maxX, maxY],
      ];
      const interactiveLayers = getInteractiveLayers(map);
      if (interactiveLayers.length === 0) {
        suppressNextClick = true;
        cleanupLasso();
        return;
      }
      const features = map.queryRenderedFeatures(bbox, {
        layers: interactiveLayers,
      });

      suppressNextClick = true;
      cleanupLasso();

      void resolveRegions(features)
        .then((regions) => {
          if (regions.length === 0) {
            return;
          }
          const current = options.getSelectedRegions();
          const merged = mergeRegionLists(current, regions);
          options.onSelectionChange(merged, merged[merged.length - 1] ?? null);
        })
        .catch((error) => {
          console.error("Failed to resolve lasso selection:", error);
        });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  map.on("click", onClick);
  map.on("mousedown", onMouseDown);

  return () => {
    cleanupLasso();
    map.off("click", onClick);
    map.off("mousedown", onMouseDown);
  };
}

function getInteractiveLayers(map: maplibregl.Map): string[] {
  return INTERACTIVE_LAYERS.filter((layerId) => Boolean(map.getLayer(layerId)));
}

function mergeRegionLists(current: RegionInfo[], next: RegionInfo[]) {
  const seen = new Set<string>();
  const merged: RegionInfo[] = [];

  for (const region of [...current, ...next]) {
    if (seen.has(region.id)) {
      continue;
    }
    seen.add(region.id);
    merged.push(region);
  }

  return merged;
}

async function resolveRegions(features: maplibregl.MapGeoJSONFeature[]) {
  const payloads = new Map<string, ResolvePayload>();
  for (const feature of features) {
    const payload = buildResolvePayload(feature);
    if (!payload) {
      continue;
    }
    const key = `${payload.regionLevel}|${payload.countryCode ?? ""}|${payload.geometryRef ?? ""}|${
      payload.name ?? ""
    }`;
    payloads.set(key, payload);
  }

  const regions = await Promise.all(
    Array.from(payloads.values()).map((payload) => resolveRegion(payload))
  );
  return regions.filter((region): region is RegionInfo => Boolean(region));
}

function resolveRegion(payload: ResolvePayload) {
  return invoke<RegionInfo | null>(
    "resolve_region",
    payload as unknown as Record<string, unknown>
  );
}

function buildResolvePayload(feature: maplibregl.MapGeoJSONFeature): ResolvePayload | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  if (feature.layer.id === "region-country-fill") {
    const countryCode = validCode(readString(props, "ISO_A2"));
    if (!countryCode) {
      return null;
    }
    return {
      regionLevel: "country",
      countryCode,
      name: readString(props, "NAME_EN") ?? readString(props, "NAME") ?? undefined,
    };
  }

  if (feature.layer.id === "region-admin1-hit") {
    const countryCode = validCode(readString(props, "iso_a2"));
    const iso3166 = validCode(readString(props, "iso_3166_2"));
    const adm1Code = validCode(readString(props, "adm1_code"));
    const geometryRef = iso3166
      ? `admin1:${iso3166}`
      : adm1Code
      ? `admin1:${adm1Code}`
      : undefined;

    if (!countryCode && !geometryRef) {
      return null;
    }

    return {
      regionLevel: "admin1",
      countryCode: countryCode ?? undefined,
      geometryRef,
      name: readString(props, "name") ?? readString(props, "name_en") ?? undefined,
    };
  }

  return null;
}

function readString(record: Record<string, unknown>, key: string) {
  const raw = record[key];
  return typeof raw === "string" ? raw : null;
}

function validCode(value: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-99" || trimmed === "-1") {
    return null;
  }
  return trimmed;
}
