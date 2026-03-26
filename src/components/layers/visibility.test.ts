import type { HintTypeInfo } from "../../types";
import { OVERLAY_LAYERS } from "../../map/overlays";
import { emitVisibilityState, mergeLayerVisibility } from "./visibility";

const hintTypes: HintTypeInfo[] = [
  {
    id: "1",
    code: "note",
    title: "Note",
    display_family: "text",
    schema_json: null,
    sort_order: 0,
    is_active: true,
  },
  {
    id: "2",
    code: "flag",
    title: "Flag",
    display_family: "icon",
    schema_json: null,
    sort_order: 1,
    is_active: true,
  },
];

describe("layer visibility utils", () => {
  it("merges overlay and hint visibility with data-based defaults", () => {
    const next = mergeLayerVisibility(
      { gsv_coverage: true },
      OVERLAY_LAYERS,
      hintTypes,
      { note: 2, flag: 0 }
    );

    expect(next.gsv_coverage).toBe(true);
    expect(next.routes).toBe(false);
    expect(next.note).toBe(true);
    expect(next.flag).toBe(false);
  });

  it("emits visibility for all hint and overlay items", () => {
    const onToggle = vi.fn();
    emitVisibilityState(
      onToggle,
      OVERLAY_LAYERS,
      hintTypes,
      {
        gsv_coverage: true,
        routes: false,
        note: true,
        flag: false,
      }
    );

    expect(onToggle).toHaveBeenCalledWith("note", true);
    expect(onToggle).toHaveBeenCalledWith("flag", false);
    expect(onToggle).toHaveBeenCalledWith("gsv_coverage", true);
    expect(onToggle).toHaveBeenCalledWith("routes", false);
  });
});
