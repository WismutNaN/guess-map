export type AppMode = "study" | "editor";

export interface RegionInfo {
  id: string;
  name: string;
  name_en?: string | null;
  country_code?: string | null;
  region_level: string;
  geometry_ref?: string | null;
  anchor_lng?: number | null;
  anchor_lat?: number | null;
}

export interface HintTypeInfo {
  id: string;
  code: string;
  title: string;
  display_family: string;
  schema_json?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface RegionHintInfo {
  id: string;
  region_id: string;
  hint_type_code: string;
  short_value?: string | null;
  full_value?: string | null;
  data_json?: string | null;
  color?: string | null;
  confidence: number;
  min_zoom: number;
  max_zoom: number;
  is_visible: boolean;
  image_asset_id?: string | null;
  icon_asset_id?: string | null;
  source_note?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AssetInfo {
  id: string;
  file_path: string;
  kind: string;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
}
