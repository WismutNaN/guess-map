import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssetEditorItem, AssetInfo, AssetUsageInfo } from "../types";

type SortMode =
  | "usage_desc"
  | "created_desc"
  | "created_asc"
  | "area_desc"
  | "name_asc";

type RawAssetEditorItem = {
  id?: unknown;
  file_path?: unknown;
  filePath?: unknown;
  kind?: unknown;
  mime_type?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  caption?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  usage_count?: unknown;
  usageCount?: unknown;
  hint_type_codes?: unknown;
  hintTypeCodes?: unknown;
  country_codes?: unknown;
  countryCodes?: unknown;
};

type RawAssetUsageItem = {
  hint_id?: unknown;
  hintId?: unknown;
  link_field?: unknown;
  linkField?: unknown;
  hint_type_code?: unknown;
  hintTypeCode?: unknown;
  hint_type_title?: unknown;
  hintTypeTitle?: unknown;
  region_id?: unknown;
  regionId?: unknown;
  region_name?: unknown;
  regionName?: unknown;
  region_level?: unknown;
  regionLevel?: unknown;
  country_code?: unknown;
  countryCode?: unknown;
  short_value?: unknown;
  shortValue?: unknown;
  full_value?: unknown;
  fullValue?: unknown;
  source_note?: unknown;
  sourceNote?: unknown;
  confidence?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState = {
  startX: number;
  startY: number;
};

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "usage_desc", label: "Most Used" },
  { value: "created_desc", label: "Newest" },
  { value: "area_desc", label: "Largest" },
  { value: "name_asc", label: "Name" },
  { value: "created_asc", label: "Oldest" },
];

export function AssetLibrary() {
  const [assets, setAssets] = useState<AssetEditorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("usage_desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewById, setPreviewById] = useState<Record<string, string>>({});
  const [usageRows, setUsageRows] = useState<AssetUsageInfo[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [imageNatural, setImageNatural] = useState<{ width: number; height: number } | null>(
    null
  );
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedId) ?? null,
    [assets, selectedId]
  );

  const kinds = useMemo(() => {
    const unique = new Set<string>();
    for (const asset of assets) {
      unique.add(asset.kind);
    }
    return ["all", ...[...unique].sort((a, b) => a.localeCompare(b))];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byKind =
      kindFilter === "all"
        ? assets
        : assets.filter((item) => item.kind.toLowerCase() === kindFilter.toLowerCase());

    const byQuery = q
      ? byKind.filter((item) => {
          const haystack = [
            item.caption ?? "",
            item.file_path,
            item.kind,
            item.hint_type_codes.join(" "),
            item.country_codes.join(" "),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : byKind;

    const sorted = [...byQuery];
    sorted.sort((a, b) => {
      switch (sortMode) {
        case "usage_desc":
          return b.usage_count - a.usage_count || compareCreatedDesc(a, b);
        case "created_desc":
          return compareCreatedDesc(a, b);
        case "created_asc":
          return compareCreatedDesc(b, a);
        case "area_desc": {
          const areaA = (a.width ?? 0) * (a.height ?? 0);
          const areaB = (b.width ?? 0) * (b.height ?? 0);
          return areaB - areaA || compareCreatedDesc(a, b);
        }
        case "name_asc":
          return displayName(a).localeCompare(displayName(b), "en", { sensitivity: "base" });
        default:
          return 0;
      }
    });
    return sorted;
  }, [assets, kindFilter, query, sortMode]);

  useEffect(() => {
    void loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (filteredAssets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredAssets.some((item) => item.id === selectedId)) {
      setSelectedId(filteredAssets[0].id);
    }
  }, [filteredAssets, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadPreview(selectedId);
    // Prefetch top rows for faster browsing.
    for (const item of filteredAssets.slice(0, 20)) {
      void loadPreview(item.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, filteredAssets]);

  useEffect(() => {
    if (!selectedAsset) {
      setUsageRows([]);
      setUsageLoading(false);
      return;
    }
    void loadUsage(selectedAsset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (!drag) return;

    const handleMove = (event: MouseEvent) => {
      updateCropFromClient(event.clientX, event.clientY, drag);
    };
    const handleUp = () => setDrag(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, imageNatural, displaySize]);

  useEffect(() => {
    const onResize = () => syncDisplaySize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function loadAssets() {
    setLoading(true);
    setError(null);
    try {
      const rows = await invoke<RawAssetEditorItem[]>("list_assets_for_editor");
      const normalized = rows
        .map(normalizeAssetEditorItem)
        .filter((item) => item.id.length > 0);
      setAssets(normalized);
    } catch (err) {
      console.error("Failed to load assets:", err);
      setError("Failed to load assets");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview(assetId: string, force = false) {
    if (!force && previewById[assetId]) {
      return;
    }
    try {
      const dataUrl = await invoke<string>("get_asset_data_url", { assetId });
      setPreviewById((prev) => ({ ...prev, [assetId]: dataUrl }));
    } catch (err) {
      console.error(`Failed to load asset preview ${assetId}:`, err);
    }
  }

  async function loadUsage(assetId: string) {
    setUsageLoading(true);
    try {
      const rows = await invoke<RawAssetUsageItem[]>("list_asset_usage", { assetId });
      setUsageRows(rows.map(normalizeAssetUsageItem).filter((item) => item.hint_id.length > 0));
    } catch (err) {
      console.error(`Failed to load asset usage ${assetId}:`, err);
      setUsageRows([]);
    } finally {
      setUsageLoading(false);
    }
  }

  function syncDisplaySize() {
    const img = imgRef.current;
    if (!img) {
      setDisplaySize(null);
      return;
    }
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDisplaySize({
        width: rect.width,
        height: rect.height,
      });
    }
  }

  function resetCropToFull() {
    if (!imageNatural) {
      setCrop(null);
      return;
    }
    setCrop({
      x: 0,
      y: 0,
      width: imageNatural.width,
      height: imageNatural.height,
    });
  }

  function updateCropFromClient(clientX: number, clientY: number, dragState: DragState) {
    const img = imgRef.current;
    if (!img || !imageNatural || !displaySize) return;
    const rect = img.getBoundingClientRect();
    const current = clientToImagePoint(clientX, clientY, rect, imageNatural);
    const x = Math.min(dragState.startX, current.x);
    const y = Math.min(dragState.startY, current.y);
    const width = Math.abs(current.x - dragState.startX);
    const height = Math.abs(current.y - dragState.startY);
    // Ignore simple clicks so the existing crop does not get reset.
    if (width < 2 && height < 2) return;
    setCrop({ x, y, width, height });
  }

  function onPreviewMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!imageNatural || !cropSupported) return;
    if (event.button !== 0) return;
    event.preventDefault();
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const start = clientToImagePoint(event.clientX, event.clientY, rect, imageNatural);
    setDrag({ startX: start.x, startY: start.y });
  }

  async function onReplaceSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedAsset) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const updated = await invoke<AssetInfo>("replace_asset_bytes", {
        input: {
          assetId: selectedAsset.id,
          fileName: file.name,
          bytes,
          caption: selectedAsset.caption ?? null,
          updatedBy: "user",
        },
      });
      updateAssetFromInfo(updated);
      await loadPreview(selectedAsset.id, true);
    } catch (err) {
      console.error("Failed to replace asset:", err);
      setError("Failed to replace image");
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function applyCrop() {
    if (!selectedAsset || !crop) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await invoke<AssetInfo>("crop_asset_image", {
        input: {
          assetId: selectedAsset.id,
          x: Math.max(0, Math.round(crop.x)),
          y: Math.max(0, Math.round(crop.y)),
          width: Math.max(1, Math.round(crop.width)),
          height: Math.max(1, Math.round(crop.height)),
          caption: selectedAsset.caption ?? null,
          updatedBy: "user",
        },
      });
      updateAssetFromInfo(updated);
      await loadPreview(selectedAsset.id, true);
    } catch (err) {
      console.error("Failed to crop asset:", err);
      setError("Failed to crop image");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedAsset() {
    if (!selectedAsset) return;
    const confirmed = window.confirm(
      `Delete "${displayName(selectedAsset)}"?\nThis will remove the file and unlink it from hints.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await invoke("delete_asset", {
        input: {
          assetId: selectedAsset.id,
          deletedBy: "user",
        },
      });
      setPreviewById((prev) => {
        const next = { ...prev };
        delete next[selectedAsset.id];
        return next;
      });
      setAssets((prev) => prev.filter((item) => item.id !== selectedAsset.id));
      setSelectedId((prev) => (prev === selectedAsset.id ? null : prev));
    } catch (err) {
      console.error("Failed to delete asset:", err);
      setError("Failed to delete asset");
    } finally {
      setBusy(false);
    }
  }

  function updateAssetFromInfo(updated: AssetInfo) {
    setAssets((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              file_path: updated.file_path,
              mime_type: updated.mime_type,
              width: updated.width,
              height: updated.height,
              caption: updated.caption,
            }
          : item
      )
    );
    setPreviewById((prev) => {
      const next = { ...prev };
      delete next[updated.id];
      return next;
    });
  }

  const selectedPreview = selectedAsset ? previewById[selectedAsset.id] ?? null : null;
  const cropSupported =
    selectedAsset?.mime_type != null
      ? !selectedAsset.mime_type.toLowerCase().includes("svg")
      : true;
  const cropOverlayStyle =
    crop && imageNatural && displaySize
      ? {
          left: `${(crop.x / imageNatural.width) * displaySize.width}px`,
          top: `${(crop.y / imageNatural.height) * displaySize.height}px`,
          width: `${(crop.width / imageNatural.width) * displaySize.width}px`,
          height: `${(crop.height / imageNatural.height) * displaySize.height}px`,
        }
      : undefined;

  return (
    <div className="asset-library">
      <aside className="asset-library-list">
        <div className="asset-library-controls">
          <input
            className="asset-library-search"
            type="search"
            value={query}
            placeholder="Search caption, kind, hint type, country…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="asset-library-control-row">
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === "all" ? "All kinds" : kind}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadAssets()} disabled={loading || busy}>
              Refresh
            </button>
          </div>
        </div>

        <div className="asset-library-list-meta">
          {loading ? "Loading..." : `${filteredAssets.length} assets`}
        </div>

        <div className="asset-library-rows">
          {filteredAssets.map((item) => {
            const active = item.id === selectedId;
            const thumb = previewById[item.id] ?? null;
            return (
              <button
                key={item.id}
                type="button"
                className={`asset-row ${active ? "active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="asset-row-thumb">
                  {thumb ? <img src={thumb} alt={displayName(item)} /> : <span>Preview</span>}
                </div>
                <div className="asset-row-body">
                  <div className="asset-row-title">{displayName(item)}</div>
                  <div className="asset-row-sub">
                    {item.kind} • used {item.usage_count}x
                  </div>
                  <div className="asset-row-sub">
                    {item.width ?? "?"}×{item.height ?? "?"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="asset-library-editor">
        {!selectedAsset && (
          <div className="asset-library-empty">Select an asset from the list</div>
        )}

        {selectedAsset && (
          <>
            <div className="asset-editor-header">
              <div>
                <div className="asset-editor-title">{displayName(selectedAsset)}</div>
                <div className="asset-editor-meta">
                  ID: {selectedAsset.id} • kind: {selectedAsset.kind} • used{" "}
                  {selectedAsset.usage_count}x
                </div>
                <div className="asset-editor-meta">
                  Hint types:{" "}
                  {selectedAsset.hint_type_codes.length > 0
                    ? selectedAsset.hint_type_codes.join(", ")
                    : "—"}
                </div>
              </div>
              <div className="asset-editor-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  onChange={onReplaceSelected}
                  hidden
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  Replace Image
                </button>
                <button
                  type="button"
                  onClick={applyCrop}
                  disabled={busy || !crop || !cropSupported}
                >
                  Apply Crop
                </button>
                <button type="button" onClick={deleteSelectedAsset} disabled={busy}>
                  Delete Asset
                </button>
              </div>
            </div>

            <div className="asset-editor-preview-wrap">
              {!selectedPreview && <div className="asset-preview-loading">Loading preview…</div>}
              {selectedPreview && (
                <div
                  className="asset-editor-preview"
                  onMouseDown={onPreviewMouseDown}
                  role="presentation"
                >
                  <img
                    ref={imgRef}
                    src={selectedPreview}
                    alt={displayName(selectedAsset)}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onLoad={(event) => {
                      const target = event.currentTarget;
                      setImageNatural({
                        width: target.naturalWidth,
                        height: target.naturalHeight,
                      });
                      requestAnimationFrame(() => {
                        syncDisplaySize();
                        setCrop({
                          x: 0,
                          y: 0,
                          width: target.naturalWidth,
                          height: target.naturalHeight,
                        });
                      });
                    }}
                  />
                  {cropOverlayStyle && <div className="asset-crop-overlay" style={cropOverlayStyle} />}
                </div>
              )}
            </div>

            <div className="asset-editor-crop-controls">
              <label>
                X
                <input
                  type="number"
                  min={0}
                  value={crop?.x ?? 0}
                  disabled={!cropSupported}
                  onChange={(event) =>
                    setCrop((prev) =>
                      prev
                        ? { ...prev, x: Math.max(0, Number(event.target.value) || 0) }
                        : prev
                    )
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  min={0}
                  value={crop?.y ?? 0}
                  disabled={!cropSupported}
                  onChange={(event) =>
                    setCrop((prev) =>
                      prev
                        ? { ...prev, y: Math.max(0, Number(event.target.value) || 0) }
                        : prev
                    )
                  }
                />
              </label>
              <label>
                W
                <input
                  type="number"
                  min={1}
                  value={crop?.width ?? 1}
                  disabled={!cropSupported}
                  onChange={(event) =>
                    setCrop((prev) =>
                      prev
                        ? { ...prev, width: Math.max(1, Number(event.target.value) || 1) }
                        : prev
                    )
                  }
                />
              </label>
              <label>
                H
                <input
                  type="number"
                  min={1}
                  value={crop?.height ?? 1}
                  disabled={!cropSupported}
                  onChange={(event) =>
                    setCrop((prev) =>
                      prev
                        ? { ...prev, height: Math.max(1, Number(event.target.value) || 1) }
                        : prev
                    )
                  }
                />
              </label>
              <button type="button" onClick={resetCropToFull} disabled={!cropSupported}>
                Full Image
              </button>
            </div>

            <div className="asset-usage-block">
              <div className="asset-usage-title">
                Linked Hint Records ({usageRows.length})
              </div>
              {usageLoading && <div className="asset-usage-empty">Loading linked records…</div>}
              {!usageLoading && usageRows.length === 0 && (
                <div className="asset-usage-empty">No linked hint records for this asset.</div>
              )}
              {!usageLoading && usageRows.length > 0 && (
                <div className="asset-usage-list">
                  {usageRows.map((row) => {
                    const value = row.short_value?.trim() || row.full_value?.trim() || "—";
                    return (
                      <div className="asset-usage-item" key={`${row.hint_id}:${row.link_field}`}>
                        <div className="asset-usage-head">
                          <span className="asset-usage-type">
                            {row.hint_type_title} ({row.hint_type_code})
                          </span>
                          <span className="asset-usage-link">{row.link_field}</span>
                        </div>
                        <div className="asset-usage-sub">
                          {row.region_name} [{row.region_level}]
                          {row.country_code ? ` • ${row.country_code}` : ""}
                        </div>
                        <div className="asset-usage-sub">Value: {value}</div>
                        {row.source_note?.trim() && (
                          <div className="asset-usage-sub">Source: {row.source_note}</div>
                        )}
                        <div className="asset-usage-sub">
                          Confidence: {Math.round(row.confidence * 100)}% • by {row.created_by}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!cropSupported && (
              <div className="asset-editor-error">
                SVG crop is not supported yet. Replace image with raster (PNG/JPEG/WebP) to crop.
              </div>
            )}
          </>
        )}

        {error && <div className="asset-editor-error">{error}</div>}
      </section>
    </div>
  );
}

function compareCreatedDesc(a: AssetEditorItem, b: AssetEditorItem) {
  const createdA = normalizeString(a.created_at) ?? "";
  const createdB = normalizeString(b.created_at) ?? "";
  return createdB.localeCompare(createdA);
}

function displayName(item: AssetEditorItem) {
  const caption = item.caption?.trim();
  if (caption) return caption;
  return item.file_path || item.id;
}

function normalizeAssetEditorItem(raw: RawAssetEditorItem): AssetEditorItem {
  return {
    id: normalizeString(raw.id) ?? "",
    file_path: normalizeString(raw.file_path) ?? normalizeString(raw.filePath) ?? "",
    kind: normalizeString(raw.kind) ?? "",
    mime_type: normalizeString(raw.mime_type) ?? normalizeString(raw.mimeType),
    width: normalizeInt(raw.width),
    height: normalizeInt(raw.height),
    caption: normalizeString(raw.caption),
    created_at: normalizeString(raw.created_at) ?? normalizeString(raw.createdAt) ?? "",
    usage_count: normalizeInt(raw.usage_count ?? raw.usageCount) ?? 0,
    hint_type_codes: normalizeStringList(raw.hint_type_codes ?? raw.hintTypeCodes),
    country_codes: normalizeStringList(raw.country_codes ?? raw.countryCodes),
  };
}

function normalizeAssetUsageItem(raw: RawAssetUsageItem): AssetUsageInfo {
  return {
    hint_id: normalizeString(raw.hint_id) ?? normalizeString(raw.hintId) ?? "",
    link_field: normalizeString(raw.link_field) ?? normalizeString(raw.linkField) ?? "image",
    hint_type_code:
      normalizeString(raw.hint_type_code) ?? normalizeString(raw.hintTypeCode) ?? "",
    hint_type_title:
      normalizeString(raw.hint_type_title) ?? normalizeString(raw.hintTypeTitle) ?? "",
    region_id: normalizeString(raw.region_id) ?? normalizeString(raw.regionId) ?? "",
    region_name: normalizeString(raw.region_name) ?? normalizeString(raw.regionName) ?? "",
    region_level: normalizeString(raw.region_level) ?? normalizeString(raw.regionLevel) ?? "",
    country_code: normalizeString(raw.country_code) ?? normalizeString(raw.countryCode),
    short_value: normalizeString(raw.short_value) ?? normalizeString(raw.shortValue),
    full_value: normalizeString(raw.full_value) ?? normalizeString(raw.fullValue),
    source_note: normalizeString(raw.source_note) ?? normalizeString(raw.sourceNote),
    confidence: normalizeNumber(raw.confidence) ?? 0,
    created_by: normalizeString(raw.created_by) ?? normalizeString(raw.createdBy) ?? "unknown",
    created_at: normalizeString(raw.created_at) ?? normalizeString(raw.createdAt) ?? "",
    updated_at: normalizeString(raw.updated_at) ?? normalizeString(raw.updatedAt) ?? "",
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized) result.push(normalized);
  }
  return result;
}

function clientToImagePoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  natural: { width: number; height: number }
) {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const relX = clamp(clientX - rect.left, 0, rect.width);
  const relY = clamp(clientY - rect.top, 0, rect.height);
  return {
    x: Math.round((relX / rect.width) * natural.width),
    y: Math.round((relY / rect.height) * natural.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
