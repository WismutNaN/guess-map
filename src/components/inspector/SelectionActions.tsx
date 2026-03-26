import { invoke } from "@tauri-apps/api/core";
import type { RegionInfo } from "../../types";

interface SelectionActionsProps {
  region: RegionInfo;
  selectedCount: number;
  onSelectionChange: (regions: RegionInfo[], active: RegionInfo | null) => void;
}

/**
 * Action buttons for region selection management:
 * - Select all regions in the same country
 * - Deselect all
 */
export function SelectionActions({
  region,
  selectedCount,
  onSelectionChange,
}: SelectionActionsProps) {
  const handleSelectAll = () => {
    if (!region.country_code) return;

    const level =
      region.region_level === "country" ? "admin1" : region.region_level;

    void invoke<RegionInfo[]>("list_regions_by_country", {
      countryCode: region.country_code,
      regionLevel: level,
    })
      .then((regions) => {
        if (regions.length === 0) return;
        const active =
          regions.find((r) => r.id === region.id) ?? regions[0];
        onSelectionChange(regions, active);
      })
      .catch((err) =>
        console.error("Failed to select regions by country:", err)
      );
  };

  return (
    <div className="selection-actions">
      <button
        type="button"
        className="btn-secondary"
        onClick={handleSelectAll}
        disabled={!region.country_code}
        title="Select all admin1 regions in this country"
      >
        Select all in country
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => onSelectionChange([], null)}
      >
        Deselect{selectedCount > 1 ? ` (${selectedCount})` : ""}
      </button>
    </div>
  );
}
