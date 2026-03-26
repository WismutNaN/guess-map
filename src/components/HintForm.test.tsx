import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RegionHintInfo, RegionInfo } from "../types";
import { HintForm } from "./HintForm";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("HintForm", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("submits create_hint with expected payload", async () => {
    const region: RegionInfo = {
      id: "region-1",
      name: "India",
      name_en: "India",
      country_code: "IN",
      region_level: "country",
      geometry_ref: "countries:IN",
      anchor_lng: 78.96,
      anchor_lat: 20.59,
    };

    const createdHint: RegionHintInfo = {
      id: "hint-1",
      region_id: "region-1",
      hint_type_code: "note",
      short_value: "Keep left",
      full_value: null,
      data_json: null,
      color: "#4a90d9",
      confidence: 1,
      min_zoom: 0,
      max_zoom: 22,
      is_visible: true,
      image_asset_id: null,
      icon_asset_id: null,
      source_note: null,
      created_by: "user",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };

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
      if (command === "create_hint") {
        return Promise.resolve(createdHint);
      }
      return Promise.resolve(null);
    });

    const onSaved = vi.fn();
    render(
      <HintForm
        region={region}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_hint_types");
    });

    fireEvent.change(screen.getByLabelText("Short value"), {
      target: { value: "Keep left" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "create_hint",
        expect.objectContaining({
          input: expect.objectContaining({
            regionId: "region-1",
            hintTypeCode: "note",
            shortValue: "Keep left",
            createdBy: "user",
          }),
        })
      );
    });

    expect(onSaved).toHaveBeenCalledWith(createdHint);
  });
});
