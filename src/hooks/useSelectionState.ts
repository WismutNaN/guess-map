import { useCallback, useMemo, useState } from "react";
import type { RegionInfo } from "../types";

export interface SelectionState {
  /** All currently selected regions */
  regions: RegionInfo[];
  /** The actively inspected region (may differ from first selected) */
  activeRegion: RegionInfo | null;
  /** Country code of the active region (for filter context) */
  selectedCountryCode: string | null;
  /** Whether multi-select is active (2+ regions) */
  isMulti: boolean;
  /** Update the selection (from map click, lasso, or programmatic) */
  setSelection: (regions: RegionInfo[], activeRegion: RegionInfo | null) => void;
  /** Clear all selection */
  clearSelection: () => void;
}

export function useSelectionState(): SelectionState {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);

  const activeRegion = useMemo(() => {
    if (regions.length === 0) return null;
    if (activeRegionId) {
      const found = regions.find((r) => r.id === activeRegionId);
      if (found) return found;
    }
    return regions[0];
  }, [activeRegionId, regions]);

  const setSelection = useCallback(
    (next: RegionInfo[], active: RegionInfo | null) => {
      setRegions(next);

      if (next.length === 0) {
        setActiveRegionId(null);
        return;
      }

      if (active) {
        setActiveRegionId(active.id);
        return;
      }

      // Preserve current active if still in selection
      setActiveRegionId((current) => {
        if (current && next.some((r) => r.id === current)) return current;
        return next[0].id;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setRegions([]);
    setActiveRegionId(null);
  }, []);

  return {
    regions,
    activeRegion,
    selectedCountryCode: activeRegion?.country_code ?? null,
    isMulti: regions.length > 1,
    setSelection,
    clearSelection,
  };
}
