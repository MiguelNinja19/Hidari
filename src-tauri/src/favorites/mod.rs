mod commands;
mod key;
mod migrate;
mod play_stats;
mod repair;
mod store;

pub use commands::{
    is_favorite_catalog_entry, list_favorite_catalog_entries, toggle_favorite_catalog_entry,
};
pub use migrate::migrate_favorite_catalog_entries;
pub use play_stats::list_library_play_stats;

#[cfg(test)]
mod tests {
    use super::key::catalog_key_for;
    use super::migrate::migrate_favorite_catalog_entries;
    use super::store::{delete_favorite_rows, favorite_exists};
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE favorite_catalog_entries (
          catalog_key TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          added_at TEXT NOT NULL
        );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn delete_removes_legacy_and_canonical_variants() {
        let conn = setup_db();
        conn
      .execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) VALUES (?1, ?2, ?3)",
        params!["source:emb_old", "Galaxy Rangers (v1)", "2024-01-01"],
      )
      .unwrap();
        conn
      .execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) VALUES (?1, ?2, ?3)",
        params!["galaxy rangers", "Galaxy Rangers", "2024-02-01"],
      )
      .unwrap();

        let key = catalog_key_for("Galaxy Rangers", None);
        assert!(favorite_exists(&conn, &key, "Galaxy Rangers"));
        delete_favorite_rows(&conn, &key, "Galaxy Rangers").unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM favorite_catalog_entries", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn migrate_deduplicates_legacy_keys() {
        let conn = setup_db();
        conn
      .execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) VALUES (?1, ?2, ?3)",
        params!["source:emb_1", "Pixel Harvest", "2024-01-01"],
      )
      .unwrap();
        conn
      .execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) VALUES (?1, ?2, ?3)",
        params!["pixel harvest", "Pixel Harvest", "2024-03-01"],
      )
      .unwrap();

        migrate_favorite_catalog_entries(&conn).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM favorite_catalog_entries", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }
}
