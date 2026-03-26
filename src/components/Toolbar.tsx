import { SearchBar } from "./SearchBar";
import type { AppMode, RegionInfo } from "../types";
import {
  DENSITY_PRESET_OPTIONS,
  type DensityPresetId,
} from "../map/presets";
import {
  PRESENTATION_MODE_OPTIONS,
  type PresentationMode,
} from "../map/presentation";

interface ToolbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onRegionSelect: (region: RegionInfo) => void;
  onToggleHistory: () => void;
  onOpenSettings: () => void;
  densityPreset: DensityPresetId;
  onDensityPresetChange: (preset: DensityPresetId) => void;
  presentationMode: PresentationMode;
  onPresentationModeChange: (mode: PresentationMode) => void;
}

export function Toolbar({
  mode,
  onModeChange,
  onRegionSelect,
  onToggleHistory,
  onOpenSettings,
  densityPreset,
  onDensityPresetChange,
  presentationMode,
  onPresentationModeChange,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="mode-toggle">
        <button
          type="button"
          className={mode === "study" ? "active" : ""}
          onClick={() => onModeChange("study")}
        >
          Study
        </button>
        <button
          type="button"
          className={mode === "editor" ? "active" : ""}
          onClick={() => onModeChange("editor")}
        >
          Editor
        </button>
      </div>
      <SearchBar onSelect={onRegionSelect} />
      <div className="toolbar-display-controls">
        <label className="toolbar-select-wrap">
          <span>Density</span>
          <select
            value={densityPreset}
            onChange={(event) => onDensityPresetChange(event.target.value as DensityPresetId)}
          >
            {DENSITY_PRESET_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select-wrap">
          <span>Show</span>
          <select
            value={presentationMode}
            onChange={(event) =>
              onPresentationModeChange(event.target.value as PresentationMode)
            }
          >
            {PRESENTATION_MODE_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="toolbar-history-button" onClick={onToggleHistory}>
        History
      </button>
      <button type="button" className="toolbar-settings-button" onClick={onOpenSettings}>
        Agent API
      </button>
    </div>
  );
}
