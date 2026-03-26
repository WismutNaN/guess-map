use serde_json::{json, Value};
use std::collections::BTreeSet;

pub(crate) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub(crate) fn normalize_data_json(value: Option<Value>) -> Option<Value> {
    match value {
        Some(Value::Null) => None,
        Some(Value::Object(map)) if map.is_empty() => None,
        Some(other) => Some(other),
        None => None,
    }
}

pub(crate) fn validate_hex_color(color: Option<&str>) -> Result<(), String> {
    let Some(color) = color else {
        return Ok(());
    };

    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return Err(format!("Invalid color '{}'. Expected #RRGGBB", color));
    }
    if !bytes[1..].iter().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid color '{}'. Expected #RRGGBB", color));
    }
    Ok(())
}

pub(crate) fn validate_zoom_and_confidence(
    min_zoom: f64,
    max_zoom: f64,
    confidence: f64,
) -> Result<(), String> {
    if min_zoom > max_zoom {
        return Err("min_zoom must be <= max_zoom".to_string());
    }
    if !(0.0..=1.0).contains(&confidence) {
        return Err("confidence must be between 0.0 and 1.0".to_string());
    }
    Ok(())
}

pub(crate) fn validate_data_json(
    schema_json: Option<&str>,
    data_json: Option<&Value>,
) -> Result<(), String> {
    let Some(schema_json) = schema_json else {
        return Ok(());
    };

    let schema: Value = serde_json::from_str(schema_json)
        .map_err(|e| format!("Invalid hint_type.schema_json: {}", e))?;
    let schema_obj = schema
        .as_object()
        .ok_or_else(|| "schema_json must be a JSON object".to_string())?;

    let required_fields: Vec<String> = schema_obj
        .get("required")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let properties = schema_obj
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let data_obj = match data_json {
        Some(Value::Object(obj)) => obj,
        Some(_) => return Err("data_json must be a JSON object".to_string()),
        None => {
            if required_fields.is_empty() {
                return Ok(());
            }
            return Err(format!(
                "data_json is required (missing fields: {})",
                required_fields.join(", ")
            ));
        }
    };

    for field in required_fields {
        match data_obj.get(&field) {
            Some(v) if !v.is_null() => {}
            _ => return Err(format!("Missing required field '{}'", field)),
        }
    }

    for (field, field_schema) in properties {
        let Some(value) = data_obj.get(&field) else {
            continue;
        };

        if let Some(expected_type) = field_schema.get("type").and_then(Value::as_str) {
            if !json_type_matches(value, expected_type) {
                return Err(format!(
                    "Field '{}' must be of type '{}'",
                    field, expected_type
                ));
            }
        }

        if let Some(enum_values) = field_schema.get("enum").and_then(Value::as_array) {
            if !enum_values.iter().any(|allowed| allowed == value) {
                return Err(format!(
                    "Field '{}' has invalid enum value '{}'",
                    field, value
                ));
            }
        }
    }

    Ok(())
}

pub(crate) fn build_object_diff(before: &Value, after: &Value) -> Value {
    let before_obj = before.as_object().cloned().unwrap_or_default();
    let after_obj = after.as_object().cloned().unwrap_or_default();

    let mut keys = BTreeSet::new();
    keys.extend(before_obj.keys().cloned());
    keys.extend(after_obj.keys().cloned());

    let mut diff = serde_json::Map::new();
    for key in keys {
        let old_value = before_obj.get(&key).cloned().unwrap_or(Value::Null);
        let new_value = after_obj.get(&key).cloned().unwrap_or(Value::Null);
        if old_value != new_value {
            diff.insert(key, json!({ "old": old_value, "new": new_value }));
        }
    }

    Value::Object(diff)
}

fn json_type_matches(value: &Value, expected_type: &str) -> bool {
    match expected_type {
        "string" => value.is_string(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        "array" => value.is_array(),
        "null" => value.is_null(),
        _ => true,
    }
}
