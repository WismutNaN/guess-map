import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { RegionInfo } from "../types";

interface SearchBarProps {
  disabled?: boolean;
  onSelect: (region: RegionInfo) => void;
}

export function SearchBar({ disabled = false, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegionInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeout = setTimeout(() => {
      setLoading(true);
      invoke<RegionInfo[]>("search_regions", { query: trimmed, limit: 12 })
        .then((items) => {
          setResults(items);
          setIsOpen(items.length > 0);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="search-bar">
      <input
        type="search"
        value={query}
        disabled={disabled}
        placeholder="Search region…"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 150);
        }}
      />
      {loading && <div className="search-loading">…</div>}
      {isOpen && (
        <div className="search-results">
          {results.map((region) => (
            <button
              key={region.id}
              type="button"
              className="search-result"
              onMouseDown={() => {
                setQuery(region.name_en || region.name);
                setIsOpen(false);
                onSelect(region);
              }}
            >
              <span className="search-name">{region.name_en || region.name}</span>
              <span className="search-meta">
                {region.region_level}
                {region.country_code ? ` · ${region.country_code}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
