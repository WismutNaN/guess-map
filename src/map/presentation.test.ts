import { applyPresentationMode } from "./presentation";

function createMapMock() {
  const setLayoutProperty = vi.fn();
  const getStyle = vi.fn(() => ({
    layers: [{ id: "hint-themed-lyr:sign" }, { id: "hint-themed-lyr:road_marking" }],
  }));
  const getLayer = vi.fn((id: string) => {
    const known = new Set(["hint-flags", "hint-notes", "hint-themed-lyr:sign", "hint-themed-lyr:road_marking"]);
    return known.has(id) ? ({ id } as unknown) : undefined;
  });

  return {
    setLayoutProperty,
    getStyle,
    getLayer,
  } as unknown as import("maplibre-gl").Map;
}

function findTextFieldCall(
  calls: Array<[string, string, unknown]>,
  layerId: string
) {
  return calls.find(([id, prop]) => id === layerId && prop === "text-field");
}

describe("presentation modes", () => {
  it("hides text for icons_only", () => {
    const map = createMapMock();
    applyPresentationMode(map, "icons_only", "balanced");

    const calls = (map.setLayoutProperty as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string, string, unknown]>;
    expect(findTextFieldCall(calls, "hint-flags")?.[2]).toEqual(["literal", ""]);
    expect(findTextFieldCall(calls, "hint-themed-lyr:sign")?.[2]).toEqual(["literal", ""]);
    expect(findTextFieldCall(calls, "hint-notes")?.[2]).toEqual(["literal", ""]);
  });

  it("enables gated text for icons_text", () => {
    const map = createMapMock();
    applyPresentationMode(map, "icons_text", "balanced");

    const calls = (map.setLayoutProperty as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string, string, unknown]>;
    const flagCall = findTextFieldCall(calls, "hint-flags");
    const themedCall = findTextFieldCall(calls, "hint-themed-lyr:sign");

    expect(Array.isArray(flagCall?.[2])).toBe(true);
    expect(Array.isArray(themedCall?.[2])).toBe(true);
    expect((flagCall?.[2] as string[])[0]).toBe("case");
    expect((themedCall?.[2] as string[])[0]).toBe("case");
  });
});
