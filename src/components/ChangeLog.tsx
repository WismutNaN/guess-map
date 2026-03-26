import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { RevisionLogEntry, RevisionLogFilterInput } from "../types";

interface ChangeLogProps {
  open: boolean;
  refreshSignal?: number;
  onClose: () => void;
}

export function ChangeLog({ open, refreshSignal = 0, onClose }: ChangeLogProps) {
  const [entries, setEntries] = useState<RevisionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filter = useMemo<RevisionLogFilterInput>(
    () => ({
      entityType: entityType || undefined,
      createdBy: createdBy || undefined,
      dateFrom: dateFrom ? `${dateFrom} 00:00:00` : undefined,
      dateTo: dateTo ? `${dateTo} 23:59:59` : undefined,
      limit: 300,
    }),
    [createdBy, dateFrom, dateTo, entityType]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoading(true);
    setError(null);
    void invoke<RevisionLogEntry[]>("list_revision_logs", { filter })
      .then((rows) => setEntries(rows))
      .catch((loadError) => setError(String(loadError)))
      .finally(() => setLoading(false));
  }, [open, refreshSignal, filter]);

  if (!open) {
    return null;
  }

  return (
    <aside className="change-log">
      <div className="change-log-header">
        <div className="section-title">Change Log</div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="change-log-filters">
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="changelog-author">Author</label>
            <select
              id="changelog-author"
              value={createdBy}
              onChange={(event) => setCreatedBy(event.target.value)}
            >
              <option value="">All</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="import">Import</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="changelog-entity">Entity</label>
            <select
              id="changelog-entity"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              <option value="">All</option>
              <option value="region_hint">Region hint</option>
              <option value="region">Region</option>
              <option value="hint_type">Hint type</option>
              <option value="asset">Asset</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="changelog-from">From</label>
            <input
              id="changelog-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="changelog-to">To</label>
            <input
              id="changelog-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="change-log-list">
        {loading ? <div className="section-muted">Loading…</div> : null}
        {!loading && error ? <div className="section-muted">Error: {error}</div> : null}
        {!loading && !error && entries.length === 0 ? (
          <div className="section-muted">No entries</div>
        ) : null}
        {!loading &&
          !error &&
          entries.map((entry) => (
            <div key={entry.id} className="change-log-item">
              <div className="change-log-item-head">
                <span>{formatDate(entry.created_at)}</span>
                <span>{entry.created_by}</span>
              </div>
              <div className="change-log-item-title">
                {entry.action} {entry.entity_type}
              </div>
              <div className="change-log-item-subtitle">{buildDiffSummary(entry)}</div>
            </div>
          ))}
      </div>
    </aside>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function buildDiffSummary(entry: RevisionLogEntry) {
  if (!entry.diff_json) {
    return entry.entity_id;
  }

  try {
    const parsed = JSON.parse(entry.diff_json) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return entry.entity_id;
    }
    return keys.slice(0, 3).join(", ");
  } catch {
    return entry.entity_id;
  }
}
