import { applyDensityPreset } from "./presets";

function createMapMock() {
  const setLayerZoomRange = vi.fn();
  const setLayoutProperty = vi.fn();
  const setFilter = vi.fn();
  const getStyle = vi.fn(() => ({
    layers: [{ id: "hint-themed-lyr:sign" }, { id: "other" }],
  }));
  const getLayer = vi.fn((id: string) => {
    const known = new Set([
      "hint-flags",
      "hint-themed-lyr:sign",
      "hint-notes",
      "routes-label",
      "city-labels",
      "city-dots",
    ]);
    return known.has(id) ? ({ id } as unknown) : undefined;
  });

  return {
    setLayerZoomRange,
    setLayoutProperty,
    setFilter,
    getStyle,
    getLayer,
  } as unknown as import("maplibre-gl").Map;
}

describe("density presets", () => {
  it("applies minimal preset zoom ranges and overlap behavior", () => {
    const map = createMapMock();
    applyDensityPreset(map, "minimal");

    expect(map.setLayerZoomRange).toHaveBeenCalledWith("hint-flags", 4, 8);
    expect(map.setLayerZoomRange).toHaveBeenCalledWith("hint-themed-lyr:sign", 22, 10);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "hint-flags",
      "icon-allow-overlap",
      false
    );
  });

  it("applies dense preset with earlier thematic visibility", () => {
    const map = createMapMock();
    applyDensityPreset(map, "dense");

    expect(map.setLayerZoomRange).toHaveBeenCalledWith("hint-flags", 2, 8);
    expect(map.setLayerZoomRange).toHaveBeenCalledWith("hint-themed-lyr:sign", 6, 10);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "hint-themed-lyr:sign",
      "icon-allow-overlap",
      true
    );
  });
});
