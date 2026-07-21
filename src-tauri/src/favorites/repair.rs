use crate::dto::FavoriteCatalogEntryDto;
use rusqlite::params;

use super::key::{catalog_key_for, is_usable_catalog_key};

pub fn repair_favorite_catalog_key(conn: &rusqlite::Connection, entry: &FavoriteCatalogEntryDto) {
    if is_usable_catalog_key(&entry.catalog_key) {
        return;
    }
    let fixed = catalog_key_for(&entry.title, None);
    if fixed.is_empty() || fixed == entry.catalog_key {
        return;
    }
    let already: bool = conn
        .query_row(
            "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
            params![&fixed],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if already {
        let _ = conn.execute(
            "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
            params![&entry.catalog_key],
        );
    } else {
        let _ = conn.execute(
            "UPDATE favorite_catalog_entries SET catalog_key = ?1 WHERE catalog_key = ?2",
            params![&fixed, &entry.catalog_key],
        );
    }
}
