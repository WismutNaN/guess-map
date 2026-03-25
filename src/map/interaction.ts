import { invoke } from "@tauri-apps/api/core";
import maplibregl from "maplibre-gl";
import type { RegionInfo } from "../types";

const INTERACTIVE_LAYERS = ["region-admin1-hit", "region-country-fill"] as const;

interface ResolvePayload {
  regionLevel: "country" | "admin1";
  countryCode?: string;
  geometryRef?: string;
  name?: string;
}

interface RegionInteractionOptions {
  isEnabled: () => boolean;
  onRegionSelected: (region: RegionInfo | null) => void;
}

export function bindRegionSelection(
  map: maplibregl.Map,
  options: RegionInteractionOptions
) {
  const onClick = (event: maplibregl.MapMouseEvent) => {
    if (!options.isEnabled()) {
      return;
    }

    const features = map.queryRenderedFeatures(event.point, {
      layers: [...INTERACTIVE_LAYERS],
    });

    if (features.length === 0) {
      options.onRegionSelected(null);
      return;
    }

    const payload = buildResolvePayload(features[0]);
    if (!payload) {
      options.onRegionSelected(null);
      return;
    }

    void invoke<RegionInfo | null>(
      "resolve_region",
      payload as unknown as Record<string, unknown>
    )
      .then((region) => {
        options.onRegionSelected(region ?? null);
      })
      .catch((error) => {
        console.error("Failed to resolve clicked region:", error);
      });
  };

  map.on("click", onClick);

  return () => {
    map.off("click", onClick);
  };
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
