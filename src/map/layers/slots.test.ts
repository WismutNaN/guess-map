import { applySlotLayout, setSlotLayers } from "./slots";

function createMapMock() {
  const visibility = new Map<string, string>([
    ["hint-flags", "visible"],
    ["hint-themed-lyr:sign", "visible"],
  ]);
  const layerSet = new Set<string>(["hint-flags", "hint-themed-lyr:sign"]);
  const setLayoutProperty = vi.fn();

  const map = {
    getLayer: vi.fn((id: string) => (layerSet.has(id) ? ({ id } as unknown) : undefined)),
    getLayoutProperty: vi.fn((id: string, prop: string) =>
      prop === "visibility" ? visibility.get(id) ?? "visible" : undefined
    ),
    setLayoutProperty,
  } as unknown as import("maplibre-gl").Map;

  return {
    map,
    visibility,
    setLayoutProperty,
  };
}

function findIconOffsetCall(
  calls: Array<[string, string, unknown]>,
  layerId: string
) {
  return calls.find(([id, prop]) => id === layerId && prop === "icon-offset");
}

describe("slot layout", () => {
  it("positions visible layers on different grid slots", () => {
    const { map, setLayoutProperty } = createMapMock();

    setSlotLayers(map, "flag", [{ layerId: "hint-flags" }]);
    setSlotLayers(map, "sign", [{ layerId: "hint-themed-lyr:sign" }]);
    applySlotLayout(map);

    const calls = setLayoutProperty.mock.calls as Array<[string, string, unknown]>;
    const flagOffset = findIconOffsetCall(calls, "hint-flags")?.[2] as [number, number];
    const signOffset = findIconOffsetCall(calls, "hint-themed-lyr:sign")?.[2] as [
      number,
      number
    ];

    expect(flagOffset).toBeDefined();
    expect(signOffset).toBeDefined();
    expect(flagOffset[0]).not.toBe(signOffset[0]);
  });

  it("uses centered offset for a single visible layer", () => {
    const { map, visibility, setLayoutProperty } = createMapMock();
    visibility.set("hint-themed-lyr:sign", "none");

    setSlotLayers(map, "flag", [{ layerId: "hint-flags" }]);
    setSlotLayers(map, "sign", [{ layerId: "hint-themed-lyr:sign" }]);
    applySlotLayout(map);

    const calls = setLayoutProperty.mock.calls as Array<[string, string, unknown]>;
    const flagOffset = findIconOffsetCall(calls, "hint-flags")?.[2] as [number, number];
    expect(flagOffset).toEqual([0, 0]);
  });

  it("adds local offsets for layered sub-slots", () => {
    const { map, setLayoutProperty } = createMapMock();

    setSlotLayers(map, "flag", [{ layerId: "hint-flags" }]);
    setSlotLayers(map, "sign", [
      { layerId: "hint-themed-lyr:sign", localOffset: [120, -60] },
    ]);
    applySlotLayout(map);

    const calls = setLayoutProperty.mock.calls as Array<[string, string, unknown]>;
    const signOffset = findIconOffsetCall(calls, "hint-themed-lyr:sign")?.[2] as [
      number,
      number
    ];

    expect(signOffset).toBeDefined();
    expect(signOffset[0]).not.toBe(0);
    expect(signOffset[1]).not.toBe(0);
  });
});
