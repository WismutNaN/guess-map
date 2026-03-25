import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { AssetInfo, HintTypeInfo, RegionHintInfo, RegionInfo } from "../types";
import { AssetUpload } from "./AssetUpload";
import { DynamicFields } from "./DynamicFields";

interface HintFormProps {
  region: RegionInfo;
  initialHint?: RegionHintInfo | null;
  onCancel: () => void;
  onSaved: (hint: RegionHintInfo) => void;
}

export function HintForm({ region, initialHint, onCancel, onSaved }: HintFormProps) {
  const [hintTypes, setHintTypes] = useState<HintTypeInfo[]>([]);
  const [hintTypeCode, setHintTypeCode] = useState(initialHint?.hint_type_code ?? "note");
  const [shortValue, setShortValue] = useState(initialHint?.short_value ?? "");
  const [fullValue, setFullValue] = useState(initialHint?.full_value ?? "");
  const [color, setColor] = useState(initialHint?.color ?? "#4a90d9");
  const [confidence, setConfidence] = useState(String(initialHint?.confidence ?? 1));
  const [minZoom, setMinZoom] = useState(String(initialHint?.min_zoom ?? 0));
  const [maxZoom, setMaxZoom] = useState(String(initialHint?.max_zoom ?? 22));
  const [sourceNote, setSourceNote] = useState(initialHint?.source_note ?? "");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<HintTypeInfo[]>("get_hint_types")
      .then((items) => {
        const active = items.filter((item) => item.is_active);
        setHintTypes(active);
        if (!initialHint && active.length > 0 && !active.some((h) => h.code === hintTypeCode)) {
          setHintTypeCode(active[0].code);
        }
      })
      .catch((error) => console.error("Failed to load hint types:", error));
  }, []);

  useEffect(() => {
    if (!initialHint) {
      setFields({});
      return;
    }

    setHintTypeCode(initialHint.hint_type_code);
    setShortValue(initialHint.short_value ?? "");
    setFullValue(initialHint.full_value ?? "");
    setColor(initialHint.color ?? "#4a90d9");
    setConfidence(String(initialHint.confidence));
    setMinZoom(String(initialHint.min_zoom));
    setMaxZoom(String(initialHint.max_zoom));
    setSourceNote(initialHint.source_note ?? "");
    setAsset(null);

    if (initialHint.data_json) {
      try {
        const parsed = JSON.parse(initialHint.data_json) as Record<string, unknown>;
        setFields(parsed);
      } catch {
        setFields({});
      }
    } else {
      setFields({});
    }
  }, [initialHint?.id]);

  const selectedType = useMemo(
    () => hintTypes.find((item) => item.code === hintTypeCode) ?? null,
    [hintTypeCode, hintTypes]
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);

    const dataJson = sanitizeDynamicFields(fields);
    const payload = {
      regionId: region.id,
      hintTypeCode,
      shortValue: toNullable(shortValue),
      fullValue: toNullable(fullValue),
      dataJson: Object.keys(dataJson).length > 0 ? dataJson : null,
      color: toNullable(color),
      confidence: toNumberOrDefault(confidence, 1),
      minZoom: toNumberOrDefault(minZoom, 0),
      maxZoom: toNumberOrDefault(maxZoom, 22),
      isVisible: true,
      imageAssetId: asset?.id ?? initialHint?.image_asset_id ?? null,
      iconAssetId: initialHint?.icon_asset_id ?? null,
      sourceNote: toNullable(sourceNote),
      createdBy: "user",
    };

    try {
      const saved = initialHint
        ? await invoke<RegionHintInfo>("update_hint", {
            input: { id: initialHint.id, ...payload },
          })
        : await invoke<RegionHintInfo>("create_hint", { input: payload });
      onSaved(saved);
    } catch (error) {
      console.error("Failed to save hint:", error);
      alert("Failed to save hint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="hint-form" onSubmit={submit}>
      <label className="form-field">
        <span>Type</span>
        <select
          value={hintTypeCode}
          onChange={(event) => setHintTypeCode(event.target.value)}
          disabled={Boolean(initialHint)}
        >
          {hintTypes.map((type) => (
            <option key={type.code} value={type.code}>
              {type.title}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field">
        <span>Short value</span>
        <input
          type="text"
          value={shortValue}
          onChange={(event) => setShortValue(event.target.value)}
        />
      </label>

      <label className="form-field">
        <span>Full description</span>
        <textarea
          rows={3}
          value={fullValue}
          onChange={(event) => setFullValue(event.target.value)}
        />
      </label>

      <DynamicFields
        schemaJson={selectedType?.schema_json}
        value={fields}
        onChange={setFields}
      />

      <div className="form-row">
        <label className="form-field">
          <span>Color</span>
          <input
            type="text"
            placeholder="#4a90d9"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Confidence</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
          />
        </label>
      </div>

      <div className="form-row">
        <label className="form-field">
          <span>Min zoom</span>
          <input
            type="number"
            min={0}
            max={22}
            step={0.5}
            value={minZoom}
            onChange={(event) => setMinZoom(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Max zoom</span>
          <input
            type="number"
            min={0}
            max={22}
            step={0.5}
            value={maxZoom}
            onChange={(event) => setMaxZoom(event.target.value)}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Source note</span>
        <input
          type="text"
          value={sourceNote}
          onChange={(event) => setSourceNote(event.target.value)}
        />
      </label>

      <AssetUpload value={asset} onChange={setAsset} />

      <div className="form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrDefault(value: string, defaultValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function sanitizeDynamicFields(input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
  return Object.fromEntries(entries);
}
