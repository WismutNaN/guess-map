export type AppMode = "study" | "editor" | "assets";

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

export interface AssetEditorItem {
  id: string;
  file_path: string;
  kind: string;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  created_at: string;
  usage_count: number;
  hint_type_codes: string[];
  country_codes: string[];
}

export interface AssetUsageInfo {
  hint_id: string;
  link_field: string;
  hint_type_code: string;
  hint_type_title: string;
  region_id: string;
  region_name: string;
  region_level: string;
  country_code?: string | null;
  short_value?: string | null;
  full_value?: string | null;
  source_note?: string | null;
  confidence: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BatchMutationResult {
  affected: number;
}

export interface EmptyRegionFilterInfo {
  country_codes: string[];
  admin1_codes: string[];
}

export interface RevisionLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  diff_json?: string | null;
  created_by: string;
  created_at: string;
  comment?: string | null;
}

export interface RevisionLogFilterInput {
  entityType?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}
