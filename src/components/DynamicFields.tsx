import { useMemo } from "react";

interface DynamicFieldsProps {
  schemaJson?: string | null;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

interface ParsedSchema {
  properties: Record<string, Record<string, unknown>>;
  required: Set<string>;
}

export function DynamicFields({ schemaJson, value, onChange }: DynamicFieldsProps) {
  const schema = useMemo<ParsedSchema | null>(() => {
    if (!schemaJson) return null;
    try {
      const parsed = JSON.parse(schemaJson) as {
        properties?: Record<string, Record<string, unknown>>;
        required?: string[];
      };
      return {
        properties: parsed.properties ?? {},
        required: new Set(parsed.required ?? []),
      };
    } catch (error) {
      console.warn("Invalid hint schema_json:", error);
      return null;
    }
  }, [schemaJson]);

  if (!schema || Object.keys(schema.properties).length === 0) {
    return null;
  }

  const updateField = (key: string, fieldValue: unknown) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <div className="dynamic-fields">
      <div className="dynamic-fields-title">Type-specific fields</div>
      {Object.entries(schema.properties).map(([fieldCode, definition]) => {
        const type = typeof definition.type === "string" ? definition.type : "string";
        const fieldValue = value[fieldCode];
        const labelRaw =
          typeof definition.title === "string" ? definition.title : fieldCode;
        const label = schema.required.has(fieldCode) ? `${labelRaw} *` : labelRaw;

        if (Array.isArray(definition.enum) && definition.enum.length > 0) {
          const selected = typeof fieldValue === "string" ? fieldValue : "";
          return (
            <label key={fieldCode} className="form-field">
              <span>{label}</span>
              <select
                value={selected}
                onChange={(event) => updateField(fieldCode, event.target.value)}
              >
                <option value="">Select...</option>
                {definition.enum.map((item) => (
                  <option key={String(item)} value={String(item)}>
                    {String(item)}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (type === "boolean") {
          const checked = fieldValue === true;
          return (
            <label key={fieldCode} className="form-field form-field-inline">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => updateField(fieldCode, event.target.checked)}
              />
              <span>{labelRaw}</span>
            </label>
          );
        }

        if (type === "number") {
          return (
            <label key={fieldCode} className="form-field">
              <span>{label}</span>
              <input
                type="number"
                value={
                  typeof fieldValue === "number" && Number.isFinite(fieldValue)
                    ? fieldValue
                    : ""
                }
                onChange={(event) => {
                  const raw = event.target.value;
                  updateField(fieldCode, raw === "" ? null : Number(raw));
                }}
              />
            </label>
          );
        }

        if (definition.format === "color") {
          return (
            <label key={fieldCode} className="form-field">
              <span>{label}</span>
              <input
                type="color"
                value={typeof fieldValue === "string" ? fieldValue : "#4a90d9"}
                onChange={(event) => updateField(fieldCode, event.target.value)}
              />
            </label>
          );
        }

        return (
          <label key={fieldCode} className="form-field">
            <span>{label}</span>
            <input
              type="text"
              value={typeof fieldValue === "string" ? fieldValue : ""}
              onChange={(event) => updateField(fieldCode, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
