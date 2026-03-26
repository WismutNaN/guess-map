import { fireEvent, render, screen } from "@testing-library/react";
import { DynamicFields } from "./DynamicFields";

describe("DynamicFields", () => {
  it("renders string, enum and boolean controls from schema_json", () => {
    const schemaJson = JSON.stringify({
      properties: {
        script_name: { type: "string", title: "Script name" },
        side: { type: "string", enum: ["left", "right"], title: "Side" },
        has_blur: { type: "boolean", title: "Has blur" },
      },
      required: ["script_name"],
    });

    const onChange = vi.fn();
    render(<DynamicFields schemaJson={schemaJson} value={{}} onChange={onChange} />);

    const textInput = screen.getByLabelText("Script name *");
    expect(textInput.tagName).toBe("INPUT");
    expect((textInput as HTMLInputElement).type).toBe("text");

    const selectInput = screen.getByLabelText("Side");
    expect(selectInput.tagName).toBe("SELECT");

    const checkbox = screen.getByLabelText("Has blur");
    expect((checkbox as HTMLInputElement).type).toBe("checkbox");

    fireEvent.change(textInput, { target: { value: "Kannada" } });
    expect(onChange).toHaveBeenCalledWith({ script_name: "Kannada" });
  });
});
