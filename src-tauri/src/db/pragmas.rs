use rusqlite::Connection;

pub(crate) fn apply_connection_pragmas(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "PRAGMA journal_mode=WAL;
       PRAGMA synchronous=NORMAL;
       PRAGMA foreign_keys=ON;
       PRAGMA cache_size=-64000;
       PRAGMA temp_store=MEMORY;
       PRAGMA mmap_size=268435456;",
    )
    .map_err(|e| format!("could_not_apply_pragmas: {e}"))
}
