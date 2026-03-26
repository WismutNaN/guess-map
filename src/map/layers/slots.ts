import maplibregl from "maplibre-gl";

export interface SlotLayerEntry {
  layerId: string;
  localOffset?: [number, number];
}

interface SlotState {
  nextOrder: number;
  registrations: Map<string, SlotCodeRegistration>;
  symbolSizeScale: number;
}

interface SlotCodeRegistration {
  code: string;
  layers: Array<Required<SlotLayerEntry>>;
  order: number;
}

const stateByMap = new WeakMap<maplibregl.Map, SlotState>();
const DEFAULT_SYMBOL_SIZE_SCALE = 1.75;
const BASE_LAYER_SPACING = 220;
const MIN_LAYER_SPACING = 180;
const MAX_LAYER_SPACING = 480;

function getState(map: maplibregl.Map): SlotState {
  const existing = stateByMap.get(map);
  if (existing) {
    return existing;
  }

  const created: SlotState = {
    nextOrder: 0,
    registrations: new Map(),
    symbolSizeScale: DEFAULT_SYMBOL_SIZE_SCALE,
  };
  stateByMap.set(map, created);
  return created;
}

function isLayerVisible(map: maplibregl.Map, layerId: string): boolean {
  if (!map.getLayer(layerId)) {
    return false;
  }
  const visibility = map.getLayoutProperty(layerId, "visibility");
  return visibility !== "none";
}

export function makeCenteredGridOffsets(
  count: number,
  spacing: number
): Array<[number, number]> {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [[0, 0]];
  }

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const startX = -((columns - 1) * spacing) / 2;
  const startY = -((rows - 1) * spacing) / 2;
  const out: Array<[number, number]> = [];

  for (let i = 0; i < count; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    out.push([
      Number((startX + col * spacing).toFixed(2)),
      Number((startY + row * spacing).toFixed(2)),
    ]);
  }

  return out;
}

function computeAdaptiveSpacingEm(
  visibleLayersCount: number,
  symbolSizeScale: number
): number {
  const layerCount = Math.max(1, visibleLayersCount);
  const columns = Math.ceil(Math.sqrt(layerCount));
  const densityFactor = 1 + Math.max(0, columns - 1) * 0.35;
  const sizeFactor = 1 + Math.max(0, symbolSizeScale - DEFAULT_SYMBOL_SIZE_SCALE) * 0.12;
  const spacing = BASE_LAYER_SPACING * densityFactor * sizeFactor;
  return Number(
    Math.max(MIN_LAYER_SPACING, Math.min(MAX_LAYER_SPACING, spacing)).toFixed(2)
  );
}

function textOffsetForIcon(iconOffset: [number, number]): [number, number] {
  return [
    Number((iconOffset[0] / 70).toFixed(2)),
    Number((1.1 + iconOffset[1] / 70).toFixed(2)),
  ];
}

export function setSlotLayoutScale(map: maplibregl.Map, symbolSizeScale: number) {
  const state = getState(map);
  if (!Number.isFinite(symbolSizeScale)) {
    state.symbolSizeScale = DEFAULT_SYMBOL_SIZE_SCALE;
    return;
  }
  state.symbolSizeScale = Math.max(0.6, Math.min(3.0, symbolSizeScale));
}

export function setSlotLayers(
  map: maplibregl.Map,
  code: string,
  layers: SlotLayerEntry[]
) {
  const state = getState(map);
  const normalized: Array<Required<SlotLayerEntry>> = layers.map((entry) => ({
    layerId: entry.layerId,
    localOffset: entry.localOffset ?? [0, 0],
  }));

  const existing = state.registrations.get(code);
  if (existing) {
    existing.layers = normalized;
    return;
  }

  state.registrations.set(code, {
    code,
    layers: normalized,
    order: state.nextOrder++,
  });
}

function isRegistrationVisible(map: maplibregl.Map, registration: SlotCodeRegistration) {
  return registration.layers.some(
    (layer) => map.getLayer(layer.layerId) && isLayerVisible(map, layer.layerId)
  );
}

export function applySlotLayout(map: maplibregl.Map) {
  const state = getState(map);
  const visible = [...state.registrations.values()]
    .filter((entry) => isRegistrationVisible(map, entry))
    .sort((a, b) => a.order - b.order);

  const spacing = computeAdaptiveSpacingEm(visible.length, state.symbolSizeScale);
  const offsets = makeCenteredGridOffsets(visible.length, spacing);

  for (let i = 0; i < visible.length; i += 1) {
    const entry = visible[i];
    const groupOffset = offsets[i] ?? [0, 0];

    for (const layer of entry.layers) {
      if (!map.getLayer(layer.layerId)) {
        continue;
      }

      const iconOffset: [number, number] = [
        Number((groupOffset[0] + layer.localOffset[0]).toFixed(2)),
        Number((groupOffset[1] + layer.localOffset[1]).toFixed(2)),
      ];
      map.setLayoutProperty(layer.layerId, "icon-offset", iconOffset);
      map.setLayoutProperty(layer.layerId, "text-offset", textOffsetForIcon(iconOffset));
    }
  }
}
