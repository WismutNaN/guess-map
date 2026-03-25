use rusqlite::Connection;

pub fn get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .ok()
}

pub fn get_or(conn: &Connection, key: &str, default: &str) -> String {
    get(conn, key).unwrap_or_else(|| default.to_string())
}

pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, value],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, key: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM app_settings WHERE key = ?1", [key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrations::run_all(&conn).unwrap();
        conn
    }

    #[test]
    fn test_get_set() {
        let conn = test_conn();
        assert_eq!(get(&conn, "foo"), None);

        set(&conn, "foo", "bar").unwrap();
        assert_eq!(get(&conn, "foo"), Some("bar".to_string()));

        set(&conn, "foo", "baz").unwrap();
        assert_eq!(get(&conn, "foo"), Some("baz".to_string()));
    }

    #[test]
    fn test_get_or_default() {
        let conn = test_conn();
        assert_eq!(get_or(&conn, "missing", "default_val"), "default_val");

        set(&conn, "missing", "real_val").unwrap();
        assert_eq!(get_or(&conn, "missing", "default_val"), "real_val");
    }

    #[test]
    fn test_delete() {
        let conn = test_conn();
        set(&conn, "to_delete", "value").unwrap();
        assert!(get(&conn, "to_delete").is_some());

        delete(&conn, "to_delete").unwrap();
        assert_eq!(get(&conn, "to_delete"), None);
    }
}
