use super::models::{HintRecord, HintTypeInfo, HintTypeMeta, RegionHintInfo};
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashMap;

pub(crate) fn list_hint_types(conn: &Connection) -> Result<Vec<HintTypeInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, code, title, display_family, schema_json, sort_order, is_active
             FROM hint_type ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let types = stmt
        .query_map([], |row| {
            Ok(HintTypeInfo {
                id: row.get(0)?,
                code: row.get(1)?,
                title: row.get(2)?,
                display_family: row.get(3)?,
                schema_json: row.get(4)?,
                sort_order: row.get(5)?,
                is_active: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(types)
}

pub(crate) fn count_hints_by_type(conn: &Connection) -> Result<HashMap<String, usize>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ht.code, COUNT(rh.id)
             FROM hint_type ht
             LEFT JOIN region_hint rh ON ht.id = rh.hint_type_id
             GROUP BY ht.code",
        )
        .map_err(|e| e.to_string())?;

    let mut counts = HashMap::new();
    stmt.query_map([], |row| {
        let code: String = row.get(0)?;
        let count: usize = row.get(1)?;
        Ok((code, count))
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .for_each(|(code, count)| {
        counts.insert(code, count);
    });

    Ok(counts)
}

pub(crate) fn list_hints_by_region(
    conn: &Connection,
    region_id: &str,
) -> Result<Vec<RegionHintInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                    rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                    rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
             FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE rh.region_id = ?1
             ORDER BY ht.sort_order, rh.sort_order, rh.created_at",
        )
        .map_err(|e| e.to_string())?;

    let hints = stmt
        .query_map([region_id], row_to_hint_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hints)
}

pub(crate) fn list_hints_by_type(
    conn: &Connection,
    hint_type_code: &str,
) -> Result<Vec<RegionHintInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                    rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                    rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
             FROM region_hint rh
             JOIN hint_type ht ON rh.hint_type_id = ht.id
             WHERE ht.code = ?1
             ORDER BY rh.created_at",
        )
        .map_err(|e| e.to_string())?;

    let hints = stmt
        .query_map([hint_type_code], row_to_hint_info)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hints)
}

pub(crate) fn query_hint_by_id(
    conn: &Connection,
    hint_id: &str,
) -> Result<Option<HintRecord>, String> {
    conn.query_row(
        "SELECT rh.id, rh.region_id, rh.hint_type_id, ht.code, rh.short_value, rh.full_value,
                rh.data_json, rh.color, rh.confidence, rh.min_zoom, rh.max_zoom, rh.is_visible,
                rh.image_asset_id, rh.icon_asset_id, rh.source_note, rh.created_by, rh.created_at, rh.updated_at
         FROM region_hint rh
         JOIN hint_type ht ON rh.hint_type_id = ht.id
         WHERE rh.id = ?1",
        [hint_id],
        |row| {
            let is_visible: i64 = row.get(11)?;
            Ok(HintRecord {
                id: row.get(0)?,
                region_id: row.get(1)?,
                hint_type_id: row.get(2)?,
                hint_type_code: row.get(3)?,
                short_value: row.get(4)?,
                full_value: row.get(5)?,
                data_json: row.get(6)?,
                color: row.get(7)?,
                confidence: row.get(8)?,
                min_zoom: row.get(9)?,
                max_zoom: row.get(10)?,
                is_visible: is_visible != 0,
                image_asset_id: row.get(12)?,
                icon_asset_id: row.get(13)?,
                source_note: row.get(14)?,
                created_by: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub(crate) fn ensure_region_is_active(conn: &Connection, region_id: &str) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM region WHERE id = ?1 AND is_active = 1",
            [region_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err(format!("Region '{}' not found or inactive", region_id));
    }
    Ok(())
}

pub(crate) fn load_hint_type_meta(
    conn: &Connection,
    hint_type_code: &str,
) -> Result<HintTypeMeta, String> {
    conn.query_row(
        "SELECT id, schema_json FROM hint_type WHERE code = ?1 AND is_active = 1",
        [hint_type_code],
        |row| {
            Ok(HintTypeMeta {
                id: row.get(0)?,
                schema_json: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Hint type '{}' not found or inactive", hint_type_code))
}

fn row_to_hint_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<RegionHintInfo> {
    let is_visible: i64 = row.get(11)?;
    Ok(RegionHintInfo {
        id: row.get(0)?,
        region_id: row.get(1)?,
        hint_type_code: row.get(3)?,
        short_value: row.get(4)?,
        full_value: row.get(5)?,
        data_json: row.get(6)?,
        color: row.get(7)?,
        confidence: row.get(8)?,
        min_zoom: row.get(9)?,
        max_zoom: row.get(10)?,
        is_visible: is_visible != 0,
        image_asset_id: row.get(12)?,
        icon_asset_id: row.get(13)?,
        source_note: row.get(14)?,
        created_by: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}
