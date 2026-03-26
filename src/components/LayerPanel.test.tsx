import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";
import { DEFAULT_COVERAGE_OPACITY } from "../map/layers/coverage";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function setupInvokeMocks() {
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_hint_types") {
      return Promise.resolve([
        {
          id: "ht-note",
          code: "note",
          title: "Note",
          display_family: "text",
          schema_json: null,
          sort_order: 12,
          is_active: true,
        },
      ]);
    }

    if (command === "get_hint_counts") {
      return Promise.resolve({ note: 3 });
    }

    return Promise.resolve(null);
  });
}

describe("LayerPanel overlays", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    setupInvokeMocks();
  });

  it("keeps overlay visibility state across refreshSignal updates", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <LayerPanel onToggle={onToggle} refreshSignal={0} />
    );

    const coverageCheckbox = await screen.findByLabelText(/GSV Coverage/i);

    expect(coverageCheckbox).not.toBeChecked();
    fireEvent.click(coverageCheckbox);
    expect(coverageCheckbox).toBeChecked();

    rerender(<LayerPanel onToggle={onToggle} refreshSignal={1} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/GSV Coverage/i)).toBeChecked();
    });

    expect(onToggle).toHaveBeenLastCalledWith("routes", false);
    expect(onToggle).toHaveBeenCalledWith("gsv_coverage", true);
  });

  it("emits coverage opacity changes when slider moves", async () => {
    const onToggle = vi.fn();
    const onCoverageOpacityChange = vi.fn();

    render(
      <LayerPanel
        onToggle={onToggle}
        onCoverageOpacityChange={onCoverageOpacityChange}
        coverageOpacity={DEFAULT_COVERAGE_OPACITY}
      />
    );

    const coverageCheckbox = await screen.findByLabelText(/GSV Coverage/i);
    fireEvent.click(coverageCheckbox);

    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "52" } });

    expect(onCoverageOpacityChange).toHaveBeenCalledWith(0.52);
  });
});
