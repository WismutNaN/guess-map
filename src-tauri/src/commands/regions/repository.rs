use super::models::{RegionInfo, RegionStats};
use rusqlite::OptionalExtension;

pub(crate) fn get_region_stats(conn: &rusqlite::Connection) -> Result<RegionStats, String> {
    let countries: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'country'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let admin1: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM region WHERE region_level = 'admin1'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(RegionStats {
        countries,
        admin1,
        total: countries + admin1,
    })
}

pub(crate) fn search_regions(
    conn: &rusqlite::Connection,
    query: &str,
    limit: Option<usize>,
) -> Result<Vec<RegionInfo>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let limit = limit.unwrap_or(20).clamp(1, 100);
    let search = format!("%{}%", q);

    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
             FROM region
             WHERE is_active = 1
               AND (name LIKE ?1 OR name_en LIKE ?1 OR country_code LIKE ?1)
             ORDER BY
               CASE region_level WHEN 'country' THEN 0 WHEN 'admin1' THEN 1 ELSE 2 END,
               name
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let regions = stmt
        .query_map(rusqlite::params![search, limit], row_to_region_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(regions)
}

pub(crate) fn resolve_region(
    conn: &rusqlite::Connection,
    region_level: &str,
    country_code: Option<&str>,
    geometry_ref: Option<&str>,
    name: Option<&str>,
) -> Result<Option<RegionInfo>, String> {
    if let Some(geometry_ref) = geometry_ref.and_then(non_empty_trimmed) {
        return conn
            .query_row(
                "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                 FROM region
                 WHERE geometry_ref = ?1 AND is_active = 1
                 LIMIT 1",
                [geometry_ref],
                row_to_region_info,
            )
            .optional()
            .map_err(|e| e.to_string());
    }

    match region_level {
        "country" => {
            let Some(cc) = country_code.and_then(non_empty_trimmed) else {
                return Ok(None);
            };
            conn.query_row(
                "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                 FROM region
                 WHERE region_level = 'country' AND country_code = ?1 AND is_active = 1
                 LIMIT 1",
                [cc],
                row_to_region_info,
            )
            .optional()
            .map_err(|e| e.to_string())
        }
        "admin1" => {
            let Some(cc) = country_code.and_then(non_empty_trimmed) else {
                return Ok(None);
            };

            if let Some(name) = name.and_then(non_empty_trimmed) {
                return conn
                    .query_row(
                        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
                         FROM region
                         WHERE region_level = 'admin1'
                           AND country_code = ?1
                           AND is_active = 1
                           AND (name = ?2 OR name_en = ?2)
                         LIMIT 1",
                        rusqlite::params![cc, name],
                        row_to_region_info,
                    )
                    .optional()
                    .map_err(|e| e.to_string());
            }

            Ok(None)
        }
        _ => Ok(None),
    }
}

pub(crate) fn get_region_by_id(
    conn: &rusqlite::Connection,
    region_id: &str,
) -> Result<Option<RegionInfo>, String> {
    conn.query_row(
        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
         FROM region
         WHERE id = ?1 AND is_active = 1",
        [region_id],
        row_to_region_info,
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub(crate) fn list_regions_by_country(
    conn: &rusqlite::Connection,
    country_code: &str,
    region_level: Option<&str>,
) -> Result<Vec<RegionInfo>, String> {
    let country_code = match non_empty_trimmed(country_code) {
        Some(value) => value.to_uppercase(),
        None => return Ok(Vec::new()),
    };

    let query = if region_level.and_then(non_empty_trimmed).is_some() {
        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
         FROM region
         WHERE is_active = 1
           AND country_code = ?1
           AND region_level = ?2
         ORDER BY name"
    } else {
        "SELECT id, name, name_en, country_code, region_level, geometry_ref, anchor_lng, anchor_lat
         FROM region
         WHERE is_active = 1
           AND country_code = ?1
         ORDER BY
           CASE region_level WHEN 'country' THEN 0 WHEN 'admin1' THEN 1 ELSE 2 END,
           name"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let regions = if let Some(level) = region_level.and_then(non_empty_trimmed) {
        stmt.query_map(rusqlite::params![country_code, level], row_to_region_info)
    } else {
        stmt.query_map([country_code], row_to_region_info)
    }
    .map_err(|e| e.to_string())?
    .filter_map(|row| row.ok())
    .collect::<Vec<_>>();

    Ok(regions)
}

fn non_empty_trimmed(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn row_to_region_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<RegionInfo> {
    Ok(RegionInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        name_en: row.get(2)?,
        country_code: row.get(3)?,
        region_level: row.get(4)?,
        geometry_ref: row.get(5)?,
        anchor_lng: row.get(6)?,
        anchor_lat: row.get(7)?,
    })
}
