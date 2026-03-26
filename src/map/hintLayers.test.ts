import { refreshHintTypeOnMap } from "./hintLayers";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("hint layer refresh integration", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("updates note source via setData after refresh", async () => {
    invokeMock.mockResolvedValue(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [78.96, 20.59] },
            properties: { short_value: "note" },
          },
        ],
      })
    );

    const setData = vi.fn();
    const map = {
      getSource: vi.fn((id: string) => {
        if (id === "hint-notes") {
          return { setData };
        }
        return undefined;
      }),
    } as unknown as import("maplibre-gl").Map;

    await refreshHintTypeOnMap(map, "note");

    expect(invokeMock).toHaveBeenCalledWith("compile_hint_layer", {
      hintTypeCode: "note",
    });
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0][0]).toMatchObject({
      type: "FeatureCollection",
    });
  });
});
