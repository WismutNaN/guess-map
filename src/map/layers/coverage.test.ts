import {
  addCoverageLayer,
  DEFAULT_COVERAGE_OPACITY,
  setCoverageOpacity,
} from "./coverage";

const invokeMock = vi.fn();
const registerLayerGroupMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../layerManager", () => ({
  registerLayerGroup: (...args: unknown[]) => registerLayerGroupMock(...args),
}));

function createMapMock(overrides?: Partial<import("maplibre-gl").Map>) {
  const addSource = vi.fn();
  const addLayer = vi.fn();
  const setPaintProperty = vi.fn();
  const getSource = vi.fn(() => undefined);
  const getLayer = vi.fn(() => ({ id: "gsv-coverage" }));

  return {
    addSource,
    addLayer,
    setPaintProperty,
    getSource,
    getLayer,
    ...overrides,
  } as unknown as import("maplibre-gl").Map;
}

describe("coverage layer", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    registerLayerGroupMock.mockReset();
  });

  it("adds raster source via localhost tile proxy from app setting", async () => {
    invokeMock.mockResolvedValue("35641");
    const map = createMapMock();

    await addCoverageLayer(map);

    expect(invokeMock).toHaveBeenCalledWith("get_setting_or", {
      key: "tile_proxy.port",
      default: "0",
    });

    expect((map.addSource as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "gsv-coverage",
      expect.objectContaining({
        type: "raster",
        tiles: ["http://127.0.0.1:35641/svv/{z}/{x}/{y}"],
      })
    );

    expect((map.addLayer as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gsv-coverage",
        type: "raster",
        paint: expect.objectContaining({
          "raster-opacity": DEFAULT_COVERAGE_OPACITY,
          "raster-contrast": 0.28,
          "raster-saturation": 0.12,
        }),
      })
    );

    expect(registerLayerGroupMock).toHaveBeenCalledWith(
      "gsv_coverage",
      ["gsv-coverage"],
      false
    );
  });

  it("throws explicit error when tile proxy port is invalid", async () => {
    invokeMock.mockResolvedValue("not-a-port");
    const map = createMapMock();

    await expect(addCoverageLayer(map)).rejects.toThrow(
      "Invalid tile proxy port: not-a-port"
    );

    expect((map.addSource as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((map.addLayer as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("skips creation when source already exists", async () => {
    const map = createMapMock({
      getSource: vi.fn(() => ({ id: "gsv-coverage" })),
    });

    await addCoverageLayer(map);

    expect(invokeMock).not.toHaveBeenCalled();
    expect((map.addSource as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((map.addLayer as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("updates opacity only when coverage layer exists", () => {
    const map = createMapMock({
      getLayer: vi.fn(() => ({ id: "gsv-coverage" })),
    });

    setCoverageOpacity(map, 0.42);
    expect((map.setPaintProperty as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "gsv-coverage",
      "raster-opacity",
      0.42
    );

    const missingLayerMap = createMapMock({
      getLayer: vi.fn(() => undefined),
    });
    setCoverageOpacity(missingLayerMap, 0.9);
    expect(
      (missingLayerMap.setPaintProperty as unknown as ReturnType<typeof vi.fn>)
    ).not.toHaveBeenCalled();
  });

  it("clamps opacity to valid range", () => {
    const map = createMapMock({
      getLayer: vi.fn(() => ({ id: "gsv-coverage" })),
    });

    setCoverageOpacity(map, 2);
    setCoverageOpacity(map, -1);

    const setPaintProperty = map.setPaintProperty as unknown as ReturnType<typeof vi.fn>;
    expect(setPaintProperty).toHaveBeenNthCalledWith(
      1,
      "gsv-coverage",
      "raster-opacity",
      1
    );
    expect(setPaintProperty).toHaveBeenNthCalledWith(
      2,
      "gsv-coverage",
      "raster-opacity",
      0
    );
  });
});
