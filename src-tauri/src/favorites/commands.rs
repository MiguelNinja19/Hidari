use crate::db::open_database_connection;
use crate::dto::{FavoriteCatalogEntryDto, ToggleFavoritePayload};
use rusqlite::params;
use tauri::AppHandle;

use super::key::{catalog_key_for, is_usable_catalog_key};
use super::migrate::migrate_favorite_catalog_entries;
use super::repair::repair_favorite_catalog_key;
use super::store::{delete_favorite_rows, favorite_exists};

#[tauri::command]
pub fn list_favorite_catalog_entries(
    app: AppHandle,
) -> Result<Vec<FavoriteCatalogEntryDto>, String> {
    let conn = open_database_connection(&app)?;
    let _ = migrate_favorite_catalog_entries(&conn);
    let mut stmt = conn
        .prepare(
            "SELECT catalog_key, title, added_at FROM favorite_catalog_entries \
       ORDER BY added_at DESC",
        )
        .map_err(|e| format!("could_not_list_favorites: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FavoriteCatalogEntryDto {
                catalog_key: row.get(0)?,
                title: row.get(1)?,
                added_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("could_not_map_favorites: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        let mut entry = row.map_err(|e| format!("could_not_read_favorite: {e}"))?;
        if !is_usable_catalog_key(&entry.catalog_key) {
            let fixed = catalog_key_for(&entry.title, None);
            repair_favorite_catalog_key(&conn, &entry);
            if !fixed.is_empty() {
                entry.catalog_key = fixed;
            }
        }
        out.push(entry);
    }
    Ok(out)
}

#[tauri::command]
pub fn toggle_favorite_catalog_entry(
    app: AppHandle,
    payload: ToggleFavoritePayload,
) -> Result<bool, String> {
    let title = payload.title.trim();
    if title.is_empty() {
        return Err("favorite_title_empty".to_string());
    }
    let key = catalog_key_for(title, payload.catalog_key.as_deref());
    let conn = open_database_connection(&app)?;
    let _ = migrate_favorite_catalog_entries(&conn);

    if favorite_exists(&conn, &key, title) {
        delete_favorite_rows(&conn, &key, title)?;
        return Ok(false);
    }

    match conn.execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) \
       VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        params![&key, title],
    ) {
        Ok(_) => Ok(true),
        // Race / identity miss: row already there under this key → treat as remove.
        Err(e) if e.to_string().contains("UNIQUE constraint failed") => {
            delete_favorite_rows(&conn, &key, title)?;
            Ok(false)
        }
        Err(e) => Err(format!("could_not_add_favorite: {e}")),
    }
}

#[tauri::command]
pub fn is_favorite_catalog_entry(app: AppHandle, catalog_key: String) -> Result<bool, String> {
    let key = catalog_key.trim();
    if key.is_empty() {
        return Ok(false);
    }
    let conn = open_database_connection(&app)?;
    Ok(favorite_exists(&conn, key, key))
}
