import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangeLog } from "./ChangeLog";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("ChangeLog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([
      {
        id: "rev-1",
        entity_type: "region_hint",
        entity_id: "hint-1",
        action: "batch_create",
        diff_json: "{\"hint_type_code\":\"driving_side\"}",
        created_by: "agent",
        created_at: "2026-03-26 14:25:00",
        comment: null,
      },
    ]);
  });

  it("loads entries and re-queries when filters change", async () => {
    render(<ChangeLog open refreshSignal={0} onClose={vi.fn()} />);

    expect(await screen.findByText(/batch_create region_hint/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_revision_logs", {
      filter: expect.objectContaining({
        createdBy: undefined,
      }),
    });

    fireEvent.change(screen.getByLabelText("Author"), {
      target: { value: "agent" },
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("list_revision_logs", {
        filter: expect.objectContaining({
          createdBy: "agent",
        }),
      });
    });

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-03-20" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-03-26" },
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("list_revision_logs", {
        filter: expect.objectContaining({
          dateFrom: "2026-03-20 00:00:00",
          dateTo: "2026-03-26 23:59:59",
        }),
      });
    });
  });
});
