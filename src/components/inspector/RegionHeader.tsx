import type { RegionInfo } from "../../types";

interface RegionHeaderProps {
  region: RegionInfo;
}

/** Compact region identity block: name, level, country code, anchor. */
export function RegionHeader({ region }: RegionHeaderProps) {
  const hasAnchor =
    region.anchor_lng !== null &&
    region.anchor_lng !== undefined &&
    region.anchor_lat !== null &&
    region.anchor_lat !== undefined;

  return (
    <div className="region-header">
      <div className="region-title">{region.name_en || region.name}</div>
      <div className="region-meta">
        {region.region_level}
        {region.country_code ? ` \u00B7 ${region.country_code}` : ""}
      </div>
      {hasAnchor && (
        <div className="region-anchor">
          {region.anchor_lng!.toFixed(3)}, {region.anchor_lat!.toFixed(3)}
        </div>
      )}
    </div>
  );
}
