/**
 * Layer group definitions for the LayerPanel.
 *
 * Groups organise hint types into collapsible sections with a group-level
 * toggle. Only "essentials" is enabled by default to keep the map clean
 * on first load.
 */

export interface LayerGroup {
  id: string;
  label: string;
  /** Hint type codes belonging to this group. */
  codes: string[];
  /** Whether all items in this group are ON by default. */
  defaultOn: boolean;
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    id: "essentials",
    label: "Essentials",
    codes: ["flag", "driving_side", "phone_hint", "country_domain"],
    defaultOn: true,
  },
  {
    id: "cameras",
    label: "Cameras",
    codes: [
      "camera_gens_tag",
      "camera_meta",
      "camera_gen1",
      "camera_gen2",
      "camera_gen3",
      "camera_gen4",
      "camera_low_cam",
      "camera_shit_cam",
      "camera_small_cam",
      "camera_trekker_gen2",
      "camera_trekker_gen3",
      "camera_trekker_gen4",
    ],
    defaultOn: false,
  },
  {
    id: "road",
    label: "Road Features",
    codes: ["sign", "road_marking", "bollard"],
    defaultOn: false,
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    codes: ["pole"],
    defaultOn: false,
  },
  {
    id: "environment",
    label: "Environment",
    codes: ["vegetation", "snow_outdoor", "snow_indoor"],
    defaultOn: false,
  },
  {
    id: "text",
    label: "Text & Scripts",
    codes: ["script_sample", "note"],
    defaultOn: false,
  },
];

/** Set of all codes that belong to at least one group. */
const GROUPED_CODES = new Set(LAYER_GROUPS.flatMap((g) => g.codes));

/** Returns the default ON/OFF state for a hint code, based on group membership. */
export function getDefaultVisibility(
  code: string,
  hasData: boolean,
): boolean {
  if (!hasData) return false;
  for (const group of LAYER_GROUPS) {
    if (group.codes.includes(code)) return group.defaultOn;
  }
  // Ungrouped types default to OFF
  return false;
}

/** True if this code is assigned to a defined group. */
export function isGroupedCode(code: string): boolean {
  return GROUPED_CODES.has(code);
}
