use rusqlite::Connection;
use uuid::Uuid;

struct HintTypeSeed {
    code: &'static str,
    title: &'static str,
    display_family: &'static str,
    schema_json: Option<&'static str>,
    sort_order: i32,
}

const BUILTIN_TYPES: &[HintTypeSeed] = &[
    HintTypeSeed {
        code: "flag",
        title: "Flag",
        display_family: "icon",
        schema_json: None,
        sort_order: 0,
    },
    HintTypeSeed {
        code: "driving_side",
        title: "Driving Side",
        display_family: "polygon_fill",
        schema_json: Some(
            r#"{"properties":{"side":{"type":"string","enum":["left","right","mixed"]}},"required":["side"]}"#,
        ),
        sort_order: 1,
    },
    HintTypeSeed {
        code: "script_sample",
        title: "Script Sample",
        display_family: "image",
        schema_json: Some(r#"{"properties":{"script_name":{"type":"string"}}}"#),
        sort_order: 2,
    },
    HintTypeSeed {
        code: "phone_hint",
        title: "Phone Hint",
        display_family: "text",
        schema_json: Some(
            r#"{"properties":{"prefix":{"type":"string"},"format":{"type":"string"}}}"#,
        ),
        sort_order: 3,
    },
    HintTypeSeed {
        code: "road_marking",
        title: "Road Marking",
        display_family: "image",
        schema_json: Some(r#"{"properties":{"marking_type":{"type":"string"}}}"#),
        sort_order: 4,
    },
    HintTypeSeed {
        code: "sign",
        title: "Road Sign",
        display_family: "image",
        schema_json: Some(r#"{"properties":{"sign_type":{"type":"string"}}}"#),
        sort_order: 5,
    },
    HintTypeSeed {
        code: "pole",
        title: "Poles",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"material":{"type":"string"},"color":{"type":"string"}}}"#,
        ),
        sort_order: 6,
    },
    HintTypeSeed {
        code: "bollard",
        title: "Bollard",
        display_family: "image",
        schema_json: Some(r#"{"properties":{"bollard_type":{"type":"string"}}}"#),
        sort_order: 7,
    },
    HintTypeSeed {
        code: "coverage",
        title: "Coverage",
        display_family: "polygon_fill",
        schema_json: Some(
            r#"{"properties":{"provider":{"type":"string"},"year":{"type":"number"}}}"#,
        ),
        sort_order: 8,
    },
    HintTypeSeed {
        code: "camera_meta",
        title: "Google Car",
        display_family: "text",
        schema_json: Some(
            r#"{"properties":{"generation":{"type":"string"},"has_blur":{"type":"boolean"}}}"#,
        ),
        sort_order: 9,
    },
    HintTypeSeed {
        code: "vegetation",
        title: "Vegetation",
        display_family: "icon",
        schema_json: Some(
            r#"{"properties":{"biome":{"type":"string"},"key_species":{"type":"string"}}}"#,
        ),
        sort_order: 10,
    },
    HintTypeSeed {
        code: "note",
        title: "Note",
        display_family: "text",
        schema_json: None,
        sort_order: 11,
    },
    HintTypeSeed {
        code: "camera_generation",
        title: "Camera Generation",
        display_family: "polygon_fill",
        schema_json: Some(
            r#"{"properties":{"generation":{"type":"string","enum":["gen1","gen2","gen3","gen4","mixed","unknown"]}}}"#,
        ),
        sort_order: 12,
    },
    HintTypeSeed {
        code: "highway",
        title: "Highway / Route",
        display_family: "line",
        schema_json: Some(
            r#"{"properties":{"route_system":{"type":"string","enum":["us_interstate","us_highway","european_e","national","other"]},"route_number":{"type":"string"},"direction":{"type":"string","enum":["N-S","E-W","NE-SW","NW-SE"]}},"required":["route_system","route_number"]}"#,
        ),
        sort_order: 13,
    },
    HintTypeSeed {
        code: "country_domain",
        title: "Country Domain",
        display_family: "text",
        schema_json: Some(
            r#"{"properties":{"tld":{"type":"string"},"country_code":{"type":"string"}}}"#,
        ),
        sort_order: 14,
    },
    HintTypeSeed {
        code: "camera_gen1",
        title: "Camera Gen 1",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 15,
    },
    HintTypeSeed {
        code: "camera_gen2",
        title: "Camera Gen 2",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 16,
    },
    HintTypeSeed {
        code: "camera_gen3",
        title: "Camera Gen 3",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 17,
    },
    HintTypeSeed {
        code: "camera_gen4",
        title: "Camera Gen 4",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 18,
    },
    HintTypeSeed {
        code: "camera_low_cam",
        title: "Camera Low Cam",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 19,
    },
    HintTypeSeed {
        code: "camera_shit_cam",
        title: "Camera Shit Cam",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 20,
    },
    HintTypeSeed {
        code: "camera_small_cam",
        title: "Camera Small Cam",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 21,
    },
    HintTypeSeed {
        code: "camera_trekker_gen2",
        title: "Camera Trekker Gen2",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 22,
    },
    HintTypeSeed {
        code: "camera_trekker_gen3",
        title: "Camera Trekker Gen3",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 23,
    },
    HintTypeSeed {
        code: "camera_trekker_gen4",
        title: "Camera Trekker Gen4",
        display_family: "polygon_fill",
        schema_json: Some(r#"{"properties":{"category":{"type":"string"}}}"#),
        sort_order: 24,
    },
    HintTypeSeed {
        code: "camera_gens_tag",
        title: "Camera Gens Tag",
        display_family: "text",
        schema_json: Some(
            r#"{"properties":{"tags":{"type":"array","items":{"type":"string"}},"count":{"type":"number"}}}"#,
        ),
        sort_order: 25,
    },
    HintTypeSeed {
        code: "snow_coverage",
        title: "Snow Coverage",
        display_family: "polygon_fill",
        schema_json: Some(
            r#"{"properties":{"mode":{"type":"string","enum":["indoor","outdoor","both"]}}}"#,
        ),
        sort_order: 26,
    },
    HintTypeSeed {
        code: "architecture",
        title: "Architecture",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"}}}"#,
        ),
        sort_order: 27,
    },
    HintTypeSeed {
        code: "gas_station",
        title: "Gas Station",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"brand":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"variant":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 28,
    },
    HintTypeSeed {
        code: "camera_rift",
        title: "Camera Rift",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"location":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 29,
    },
    HintTypeSeed {
        code: "house_number",
        title: "House Number",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"label":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 30,
    },
    HintTypeSeed {
        code: "license_plate",
        title: "License Plate",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"label":{"type":"string"},"region":{"type":"string"},"plate_view":{"type":"string"},"period":{"type":"string"},"vehicle_type":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 31,
    },
    HintTypeSeed {
        code: "curb",
        title: "Curb",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 32,
    },
    HintTypeSeed {
        code: "follow_car",
        title: "Follow Car",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"label":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 33,
    },
    HintTypeSeed {
        code: "scenery",
        title: "Scenery",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 34,
    },
    HintTypeSeed {
        code: "nature",
        title: "Nature",
        display_family: "image",
        schema_json: Some(
            r#"{"properties":{"continent":{"type":"string"},"map_url":{"type":"string"},"image_url":{"type":"string"},"species":{"type":"string"},"source_country":{"type":"string"}}}"#,
        ),
        sort_order: 35,
    },
];

/// Seed built-in hint types. Idempotent — uses INSERT OR IGNORE per type,
/// so new types get added to existing databases without affecting existing data.
pub fn seed(conn: &Connection) -> Result<usize, String> {
    let mut count = 0;
    for ht in BUILTIN_TYPES {
        let changed = conn.execute(
            "INSERT OR IGNORE INTO hint_type (id, code, title, display_family, schema_json, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                ht.code,
                ht.title,
                ht.display_family,
                ht.schema_json,
                ht.sort_order,
            ],
        )
        .map_err(|e| format!("Failed to seed hint_type {}: {}", ht.code, e))?;
        count += changed;
    }

    // Deprecation policy: legacy camera-generation aggregate, Survey Car Type,
    // and split snow layers are removed as standalone layers.
    conn.execute(
        "UPDATE hint_type
         SET is_active = 0
         WHERE code IN ('car_type', 'camera_generation', 'snow_outdoor', 'snow_indoor')
           AND is_active <> 0",
        [],
    )
    .map_err(|e| format!("Failed to deactivate deprecated hint types: {}", e))?;

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn test_seed_hint_types() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        let count = seed(&conn).unwrap();
        assert_eq!(count, BUILTIN_TYPES.len());

        // Verify all codes exist
        let codes: Vec<String> = conn
            .prepare("SELECT code FROM hint_type ORDER BY sort_order")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(codes[0], "flag");
        assert_eq!(codes[1], "driving_side");
        assert_eq!(codes.len(), BUILTIN_TYPES.len());
    }

    #[test]
    fn test_seed_idempotent() {
        let db = db::DbState::new_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        seed(&conn).unwrap();
        let count2 = seed(&conn).unwrap();
        assert_eq!(count2, 0); // Already seeded, skip
    }
}
