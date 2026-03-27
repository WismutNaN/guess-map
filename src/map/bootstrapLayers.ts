import maplibregl from "maplibre-gl";
import {
  addCityLayers,
  addCoverageLayer,
  addDrivingSideLayer,
  addHintGridLayer,
  addNoteLayer,
  addPolygonHintLayers,
  addRegionLayers,
  addRouteLayers,
} from "./layers";

type LayerBootstrapStep = {
  label: string;
  run: (map: maplibregl.Map) => Promise<void>;
};

const LAYER_BOOTSTRAP_STEPS: LayerBootstrapStep[] = [
  { label: "region layers", run: addRegionLayers },
  { label: "driving_side layer", run: addDrivingSideLayer },
  { label: "polygon hint layers", run: addPolygonHintLayers },
  { label: "city layers", run: addCityLayers },
  // Coverage must stay below hint symbols so flags/notes remain readable.
  { label: "coverage layer", run: addCoverageLayer },
  // Unified hint grid — replaces separate flag + thematic hint layers.
  { label: "hint grid layer", run: addHintGridLayer },
  { label: "note layer", run: addNoteLayer },
  { label: "route layers", run: addRouteLayers },
];

/**
 * Loads all map content layers in deterministic order.
 * Individual step failures are logged and do not block the rest.
 */
export async function bootstrapMapLayers(map: maplibregl.Map): Promise<void> {
  for (const step of LAYER_BOOTSTRAP_STEPS) {
    try {
      await step.run(map);
    } catch (error) {
      console.error(`Failed to load ${step.label}:`, error);
    }
  }
}
