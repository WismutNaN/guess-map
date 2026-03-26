use r2d2::{CustomizeConnection, Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbPooledConnection = PooledConnection<SqliteConnectionManager>;

#[derive(Debug, Default)]
struct SqlitePragmas;

impl CustomizeConnection<Connection, rusqlite::Error> for SqlitePragmas {
    fn on_acquire(&self, conn: &mut Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
        )?;
        Ok(())
    }
}

pub fn create_pool(db_path: &Path) -> Result<DbPool, String> {
    let manager = SqliteConnectionManager::file(db_path);
    Pool::builder()
        .max_size(12)
        .connection_customizer(Box::new(SqlitePragmas))
        .build(manager)
        .map_err(|e| e.to_string())
}
