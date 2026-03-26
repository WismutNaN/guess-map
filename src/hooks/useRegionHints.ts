import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RegionHintInfo } from "../types";

export interface RegionHintsState {
  hints: RegionHintInfo[];
  loading: boolean;
  /** Reload hints for the current region */
  reload: () => void;
}

/**
 * Loads and manages hints for a given region ID.
 * Automatically reloads when regionId changes.
 */
export function useRegionHints(regionId: string | null): RegionHintsState {
  const [hints, setHints] = useState<RegionHintInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await invoke<RegionHintInfo[]>("get_hints_by_region", {
        regionId: id,
      });
      setHints(data);
    } catch (err) {
      console.error("Failed to load hints:", err);
      setHints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!regionId) {
      setHints([]);
      return;
    }
    void load(regionId);
  }, [regionId, load]);

  const reload = useCallback(() => {
    if (regionId) void load(regionId);
  }, [regionId, load]);

  return { hints, loading, reload };
}
