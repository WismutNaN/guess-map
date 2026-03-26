interface RegionStats {
  countries: number;
  admin1: number;
  total: number;
}

interface StatusBarProps {
  stats: RegionStats | null;
  zoom: number;
  selectedCount: number;
}

export function StatusBar({ stats, zoom, selectedCount }: StatusBarProps) {
  return (
    <div className="status-bar">
      {stats && (
        <>
          <div className="stat">
            <span className="stat-label">Countries:</span>
            <span className="stat-value">{stats.countries}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Regions:</span>
            <span className="stat-value">{stats.admin1}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total:</span>
            <span className="stat-value">{stats.total}</span>
          </div>
        </>
      )}
      <div className="stat">
        <span className="stat-label">Selected:</span>
        <span className="stat-value">{selectedCount}</span>
      </div>
      <div className="zoom-info">Zoom: {zoom.toFixed(1)}</div>
    </div>
  );
}
