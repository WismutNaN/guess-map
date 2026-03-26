import { addRouteLayers, refreshRouteLayers, setRoutesCountryFilter } from "./routes";

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
  const getSource = vi.fn(() => undefined);
  const getLayer = vi.fn(() => ({ id: "any" }));
  const setFilter = vi.fn();

  return {
    addSource,
    addLayer,
    getSource,
    getLayer,
    setFilter,
    ...overrides,
  } as unknown as import("maplibre-gl").Map;
}

describe("routes layer", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    registerLayerGroupMock.mockReset();
  });

  it("loads route GeoJSON via compile_line_layer and registers group", async () => {
    invokeMock.mockResolvedValue(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
            properties: { route_number: "I-10", color: "#E31937" },
          },
        ],
      })
    );

    const map = createMapMock();
    await addRouteLayers(map);

    expect(invokeMock).toHaveBeenCalledWith("compile_line_layer", {
      hintTypeCode: "highway",
    });
    expect((map.addSource as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "routes",
      expect.objectContaining({ type: "geojson" })
    );
    expect(registerLayerGroupMock).toHaveBeenCalledWith(
      "routes",
      ["routes-casing", "routes-line", "routes-label"],
      false
    );
  });

  it("refreshes routes source data", async () => {
    invokeMock.mockResolvedValue(
      JSON.stringify({
        type: "FeatureCollection",
        features: [],
      })
    );

    const setData = vi.fn();
    const map = createMapMock({
      getSource: vi.fn(() => ({ setData })),
    });

    await refreshRouteLayers(map);
    expect(setData).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FeatureCollection", features: [] })
    );
  });

  it("applies and clears country filter on route layers", () => {
    const map = createMapMock();
    setRoutesCountryFilter(map, "US");
    setRoutesCountryFilter(map, null);

    const setFilter = map.setFilter as unknown as ReturnType<typeof vi.fn>;
    expect(setFilter).toHaveBeenCalled();
    expect(setFilter).toHaveBeenLastCalledWith("routes-label", null);
  });
});
