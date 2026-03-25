import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, type ChangeEvent } from "react";
import type { AssetInfo } from "../types";

interface AssetUploadProps {
  value: AssetInfo | null;
  onChange: (asset: AssetInfo | null) => void;
}

export function AssetUpload({ value, onChange }: AssetUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const uploaded = await invoke<AssetInfo>("upload_asset_bytes", {
        input: {
          fileName: file.name,
          bytes,
          kind: "sample",
          createdBy: "user",
        },
      });

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(file));
      onChange(uploaded);
    } catch (error) {
      console.error("Failed to upload asset:", error);
      alert("Asset upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="asset-upload">
      <label className="asset-upload-button">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={uploading}
          onChange={onFileSelected}
        />
        {uploading ? "Uploading..." : "Upload image"}
      </label>

      {(previewUrl || value) && (
        <div className="asset-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" />
          ) : (
            <div className="asset-preview-placeholder">
              Uploaded: {value?.file_path}
            </div>
          )}
          <button type="button" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
