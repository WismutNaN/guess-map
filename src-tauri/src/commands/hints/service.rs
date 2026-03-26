use super::models::{
    BatchCreateHintsInput, BatchDeleteHintsInput, CreateHintInput, RegionHintInfo, UpdateHintInput,
};
use super::{repository, validator};
use crate::services::revision;
use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

pub(crate) fn create_hint(
    conn: &mut Connection,
    input: CreateHintInput,
) -> Result<RegionHintInfo, String> {
    repository::ensure_region_is_active(conn, &input.region_id)?;
    let hint_type = repository::load_hint_type_meta(conn, &input.hint_type_code)?;

    let short_value = validator::normalize_optional_text(input.short_value);
    let full_value = validator::normalize_optional_text(input.full_value);
    let color = validator::normalize_optional_text(input.color);
    let source_note = validator::normalize_optional_text(input.source_note);
    let image_asset_id = validator::normalize_optional_text(input.image_asset_id);
    let icon_asset_id = validator::normalize_optional_text(input.icon_asset_id);
    let data_json = validator::normalize_data_json(input.data_json);

    validator::validate_hex_color(color.as_deref())?;
    validator::validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = input.min_zoom.unwrap_or(0.0);
    let max_zoom = input.max_zoom.unwrap_or(22.0);
    let confidence = input.confidence.unwrap_or(1.0);
    validator::validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = input.is_visible.unwrap_or(true);
    let created_by =
        validator::normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let data_json_str = data_json
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
        .transpose()?;

    let hint_id = Uuid::new_v4().to_string();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO region_hint (
            id, region_id, hint_type_id, short_value, full_value, data_json, color,
            confidence, min_zoom, max_zoom, is_visible, image_asset_id, icon_asset_id,
            source_note, created_by
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15
         )",
        rusqlite::params![
            hint_id,
            input.region_id,
            hint_type.id,
            short_value,
            full_value,
            data_json_str,
            color,
            confidence,
            min_zoom,
            max_zoom,
            if is_visible { 1 } else { 0 },
            image_asset_id,
            icon_asset_id,
            source_note,
            created_by,
        ],
    )
    .map_err(|e| e.to_string())?;

    let inserted = repository::query_hint_by_id(&tx, &hint_id)?
        .ok_or_else(|| "Failed to load created hint".to_string())?;
    revision::log(
        &tx,
        "region_hint",
        &hint_id,
        "create",
        Some(&json!({ "after": inserted.as_value() })),
        &created_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(inserted.to_info())
}

pub(crate) fn batch_create_hints(
    conn: &mut Connection,
    input: BatchCreateHintsInput,
) -> Result<usize, String> {
    let region_ids = normalize_region_ids(input.region_ids)?;
    let hint_type = repository::load_hint_type_meta(conn, &input.hint_type_code)?;

    let short_value = validator::normalize_optional_text(input.short_value);
    let full_value = validator::normalize_optional_text(input.full_value);
    let color = validator::normalize_optional_text(input.color);
    let source_note = validator::normalize_optional_text(input.source_note);
    let image_asset_id = validator::normalize_optional_text(input.image_asset_id);
    let icon_asset_id = validator::normalize_optional_text(input.icon_asset_id);
    let data_json = validator::normalize_data_json(input.data_json);

    validator::validate_hex_color(color.as_deref())?;
    validator::validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = input.min_zoom.unwrap_or(0.0);
    let max_zoom = input.max_zoom.unwrap_or(22.0);
    let confidence = input.confidence.unwrap_or(1.0);
    validator::validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = input.is_visible.unwrap_or(true);
    let created_by =
        validator::normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let data_json_str = data_json
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
        .transpose()?;

    let mut affected = 0usize;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for region_id in &region_ids {
        repository::ensure_region_is_active(&tx, region_id)?;
        let hint_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO region_hint (
                id, region_id, hint_type_id, short_value, full_value, data_json, color,
                confidence, min_zoom, max_zoom, is_visible, image_asset_id, icon_asset_id,
                source_note, created_by
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15
             )",
            rusqlite::params![
                hint_id,
                region_id,
                &hint_type.id,
                short_value.as_deref(),
                full_value.as_deref(),
                data_json_str.as_deref(),
                color.as_deref(),
                confidence,
                min_zoom,
                max_zoom,
                if is_visible { 1 } else { 0 },
                image_asset_id.as_deref(),
                icon_asset_id.as_deref(),
                source_note.as_deref(),
                &created_by,
            ],
        )
        .map_err(|e| e.to_string())?;

        let inserted = repository::query_hint_by_id(&tx, &hint_id)?
            .ok_or_else(|| "Failed to load created hint".to_string())?;
        revision::log(
            &tx,
            "region_hint",
            &hint_id,
            "create",
            Some(&json!({ "after": inserted.as_value() })),
            &created_by,
            Some("batch_create"),
        )?;
        affected += 1;
    }

    revision::log(
        &tx,
        "region_hint",
        &Uuid::new_v4().to_string(),
        "batch_create",
        Some(&json!({
            "hint_type_code": input.hint_type_code,
            "regions_count": affected,
            "region_ids": region_ids
        })),
        &created_by,
        None,
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(affected)
}

pub(crate) fn batch_delete_hints(
    conn: &mut Connection,
    input: BatchDeleteHintsInput,
) -> Result<usize, String> {
    let region_ids = normalize_region_ids(input.region_ids)?;
    let hint_type = repository::load_hint_type_meta(conn, &input.hint_type_code)?;
    let author =
        validator::normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());

    let mut affected = 0usize;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for region_id in &region_ids {
        let mut stmt = tx
            .prepare(
                "SELECT id
                 FROM region_hint
                 WHERE region_id = ?1
                   AND hint_type_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        let hint_ids = stmt
            .query_map(rusqlite::params![region_id, &hint_type.id], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        drop(stmt);

        for hint_id in hint_ids {
            let existing = repository::query_hint_by_id(&tx, &hint_id)?
                .ok_or_else(|| format!("Hint '{}' not found", hint_id))?;
            tx.execute("DELETE FROM region_hint WHERE id = ?1", [&hint_id])
                .map_err(|e| e.to_string())?;
            revision::log(
                &tx,
                "region_hint",
                &hint_id,
                "delete",
                Some(&json!({ "before": existing.as_value() })),
                &author,
                Some("batch_delete"),
            )?;
            affected += 1;
        }
    }

    revision::log(
        &tx,
        "region_hint",
        &Uuid::new_v4().to_string(),
        "batch_delete",
        Some(&json!({
            "hint_type_code": input.hint_type_code,
            "deleted_hints": affected,
            "region_ids": region_ids
        })),
        &author,
        None,
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(affected)
}

pub(crate) fn update_hint(
    conn: &mut Connection,
    input: UpdateHintInput,
) -> Result<RegionHintInfo, String> {
    let existing = repository::query_hint_by_id(conn, &input.id)?
        .ok_or_else(|| format!("Hint '{}' not found", input.id))?;

    repository::ensure_region_is_active(conn, &input.region_id)?;
    let hint_type = repository::load_hint_type_meta(conn, &input.hint_type_code)?;

    let short_value = validator::normalize_optional_text(input.short_value);
    let full_value = validator::normalize_optional_text(input.full_value);
    let color = validator::normalize_optional_text(input.color);
    let source_note = validator::normalize_optional_text(input.source_note);
    let image_asset_id = validator::normalize_optional_text(input.image_asset_id);
    let icon_asset_id = validator::normalize_optional_text(input.icon_asset_id);
    let data_json = validator::normalize_data_json(input.data_json);

    validator::validate_hex_color(color.as_deref())?;
    validator::validate_data_json(hint_type.schema_json.as_deref(), data_json.as_ref())?;

    let min_zoom = input.min_zoom.unwrap_or(existing.min_zoom);
    let max_zoom = input.max_zoom.unwrap_or(existing.max_zoom);
    let confidence = input.confidence.unwrap_or(existing.confidence);
    validator::validate_zoom_and_confidence(min_zoom, max_zoom, confidence)?;

    let is_visible = input.is_visible.unwrap_or(existing.is_visible);
    let updated_by =
        validator::normalize_optional_text(input.created_by).unwrap_or_else(|| "user".to_string());
    let data_json_str = data_json
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
        .transpose()?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE region_hint
         SET region_id = ?1,
             hint_type_id = ?2,
             short_value = ?3,
             full_value = ?4,
             data_json = ?5,
             color = ?6,
             confidence = ?7,
             min_zoom = ?8,
             max_zoom = ?9,
             is_visible = ?10,
             image_asset_id = ?11,
             icon_asset_id = ?12,
             source_note = ?13,
             updated_at = datetime('now')
         WHERE id = ?14",
        rusqlite::params![
            input.region_id,
            hint_type.id,
            short_value,
            full_value,
            data_json_str,
            color,
            confidence,
            min_zoom,
            max_zoom,
            if is_visible { 1 } else { 0 },
            image_asset_id,
            icon_asset_id,
            source_note,
            input.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let updated = repository::query_hint_by_id(&tx, &input.id)?
        .ok_or_else(|| "Failed to load updated hint".to_string())?;
    let diff = validator::build_object_diff(&existing.as_value(), &updated.as_value());
    revision::log(
        &tx,
        "region_hint",
        &input.id,
        "update",
        Some(&diff),
        &updated_by,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(updated.to_info())
}

pub(crate) fn delete_hint(
    conn: &mut Connection,
    hint_id: &str,
    created_by: Option<String>,
) -> Result<(), String> {
    let existing = repository::query_hint_by_id(conn, hint_id)?
        .ok_or_else(|| format!("Hint '{}' not found", hint_id))?;
    let author =
        validator::normalize_optional_text(created_by).unwrap_or_else(|| "user".to_string());

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM region_hint WHERE id = ?1", [hint_id])
        .map_err(|e| e.to_string())?;
    revision::log(
        &tx,
        "region_hint",
        hint_id,
        "delete",
        Some(&json!({ "before": existing.as_value() })),
        &author,
        None,
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_region_ids(region_ids: Vec<String>) -> Result<Vec<String>, String> {
    use std::collections::BTreeSet;

    let mut dedup = BTreeSet::new();
    for raw in region_ids {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            dedup.insert(trimmed.to_string());
        }
    }

    if dedup.is_empty() {
        return Err("region_ids must contain at least one id".to_string());
    }

    Ok(dedup.into_iter().collect())
}
