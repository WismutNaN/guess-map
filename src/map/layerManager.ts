import maplibregl from "maplibre-gl";

export interface LayerGroup {
  /** MapLibre layer IDs belonging to this group */
  layerIds: string[];
  /** Whether currently visible */
  visible: boolean;
}

/**
 * Manages map layer groups — tracks which layers belong together
 * and provides toggling visibility by group name.
 */
const registry = new Map<string, LayerGroup>();

export function registerLayerGroup(
  groupName: string,
  layerIds: string[],
  visible = true
) {
  registry.set(groupName, { layerIds, visible });
}

export function setLayerGroupVisibility(
  map: maplibregl.Map,
  groupName: string,
  visible: boolean
) {
  const group = registry.get(groupName);
  if (!group) {
    console.warn(`[LayerMgr] group "${groupName}" not found in registry`);
    return;
  }

  group.visible = visible;
  for (const id of group.layerIds) {
    const layer = map.getLayer(id);
    if (layer) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }
}

export function isLayerGroupVisible(groupName: string): boolean {
  return registry.get(groupName)?.visible ?? false;
}

export function getRegisteredGroups(): string[] {
  return Array.from(registry.keys());
}
