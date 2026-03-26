import { SearchBar } from "./SearchBar";
import type { AppMode, RegionInfo } from "../types";

interface ToolbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onRegionSelect: (region: RegionInfo) => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  mode,
  onModeChange,
  onRegionSelect,
  onOpenSettings,
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
      <button type="button" className="toolbar-settings-button" onClick={onOpenSettings}>
        Agent API
      </button>
    </div>
  );
}
