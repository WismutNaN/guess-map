import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkActions } from "./BulkActions";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const selectedRegions = [
  {
    id: "r-1",
    name: "Karnataka",
    name_en: "Karnataka",
    country_code: "IN",
    region_level: "admin1",
  },
  {
    id: "r-2",
    name: "Tamil Nadu",
    name_en: "Tamil Nadu",
    country_code: "IN",
    region_level: "admin1",
  },
];

describe("BulkActions", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_hint_types") {
        return Promise.resolve([
          {
            id: "ht-note",
            code: "note",
            title: "Note",
            display_family: "text",
            schema_json: null,
            sort_order: 1,
            is_active: true,
          },
        ]);
      }
      if (command === "batch_create_hints") {
        return Promise.resolve({ affected: 2 });
      }
      if (command === "batch_delete_hints") {
        return Promise.resolve({ affected: 2 });
      }
      return Promise.resolve(null);
    });
  });

  it("submits batch_create_hints with selected region ids", async () => {
    const onHintChanged = vi.fn();
    render(
      <BulkActions
        selectedRegions={selectedRegions}
        onClearSelection={vi.fn()}
        onHintChanged={onHintChanged}
      />
    );

    await screen.findByLabelText("Type");
    fireEvent.change(screen.getByLabelText("Short value"), {
      target: { value: "Left side roads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply to 2 regions/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("batch_create_hints", {
        input: expect.objectContaining({
          regionIds: ["r-1", "r-2"],
          hintTypeCode: "note",
          shortValue: "Left side roads",
        }),
      });
    });
    expect(onHintChanged).toHaveBeenCalledWith("note");
  });
});
