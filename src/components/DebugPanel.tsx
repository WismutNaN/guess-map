interface DebugPanelProps {
  showCollisionBoxes: boolean;
  showTileBoundaries: boolean;
  onShowCollisionBoxesChange: (enabled: boolean) => void;
  onShowTileBoundariesChange: (enabled: boolean) => void;
}

export function DebugPanel({
  showCollisionBoxes,
  showTileBoundaries,
  onShowCollisionBoxesChange,
  onShowTileBoundariesChange,
}: DebugPanelProps) {
  return (
    <div className="debug-panel">
      <div className="debug-panel-title">Debug</div>
      <label className="debug-panel-item">
        <input
          type="checkbox"
          checked={showCollisionBoxes}
          onChange={(event) => onShowCollisionBoxesChange(event.target.checked)}
        />
        Collision boxes
      </label>
      <label className="debug-panel-item">
        <input
          type="checkbox"
          checked={showTileBoundaries}
          onChange={(event) => onShowTileBoundariesChange(event.target.checked)}
        />
        Tile boundaries
      </label>
    </div>
  );
}
