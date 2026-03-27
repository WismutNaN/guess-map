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
  it("merges overlay and hint visibility with group-based defaults", () => {
    const next = mergeLayerVisibility(
      { gsv_coverage: true },
      OVERLAY_LAYERS,
      hintTypes,
      { note: 2, flag: 0 },
    );

    expect(next.gsv_coverage).toBe(true);
    expect(next.routes).toBe(false);
    // "note" is in "text" group (defaultOn: false), so defaults to OFF even with data
    expect(next.note).toBe(false);
    // "flag" has no data, so always OFF
    expect(next.flag).toBe(false);
  });

  it("respects saved visibility over defaults", () => {
    const next = mergeLayerVisibility(
      {},
      OVERLAY_LAYERS,
      hintTypes,
      { note: 2, flag: 5 },
      { note: true, flag: false },
    );

    // Saved takes priority
    expect(next.note).toBe(true);
    expect(next.flag).toBe(false);
  });

  it("essentials group defaults to ON with data", () => {
    const types: HintTypeInfo[] = [
      { id: "3", code: "flag", title: "Flag", display_family: "icon", schema_json: null, sort_order: 0, is_active: true },
      { id: "4", code: "phone_hint", title: "Phone", display_family: "text", schema_json: null, sort_order: 1, is_active: true },
    ];
    const next = mergeLayerVisibility(
      {},
      OVERLAY_LAYERS,
      types,
      { flag: 10, phone_hint: 5 },
    );

    expect(next.flag).toBe(true);
    expect(next.phone_hint).toBe(true);
  });

  it("emits all values on first sync when previous visibility is empty", () => {
    const onToggle = vi.fn();
    const emitted = emitVisibilityState(
      onToggle,
      OVERLAY_LAYERS,
      hintTypes,
      {},
      {
        gsv_coverage: true,
        routes: false,
        note: true,
        flag: false,
      },
    );

    expect(emitted).toBe(4);
    expect(onToggle).toHaveBeenCalledWith("note", true);
    expect(onToggle).toHaveBeenCalledWith("flag", false);
    expect(onToggle).toHaveBeenCalledWith("gsv_coverage", true);
    expect(onToggle).toHaveBeenCalledWith("routes", false);
  });

  it("emits only changed items", () => {
    const onToggle = vi.fn();
    const emitted = emitVisibilityState(
      onToggle,
      OVERLAY_LAYERS,
      hintTypes,
      {
        gsv_coverage: true,
        routes: false,
        note: true,
        flag: false,
      },
      {
        gsv_coverage: true,
        routes: false,
        note: true,
        flag: true,
      },
    );

    expect(emitted).toBe(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("flag", true);
  });
});
