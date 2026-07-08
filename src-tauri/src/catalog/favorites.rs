use crate::db::open_database_connection;
use crate::dto::{
  CatalogChangeDto, CollectionDto, CollectionEntryDto, CollectionEntryPayload, CollectionIdPayload,
  CreateCollectionPayload, FavoriteCatalogEntryDto, RenameCollectionPayload, ToggleFavoritePayload,
};
use rusqlite::{params, Connection};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use tauri::AppHandle;

fn new_collection_id(name: &str) -> String {
  let mut hasher = DefaultHasher::new();
  name.hash(&mut hasher);
  format!("col_{:x}", hasher.finish())
}

#[tauri::command]
pub fn toggle_favorite_catalog_entry(
  app: AppHandle,
  payload: ToggleFavoritePayload,
) -> Result<bool, String> {
  let conn = open_database_connection(&app)?;
  let key = payload.catalog_key.trim();
  if key.is_empty() {
    return Err("catalog_key_required".to_string());
  }
  let exists: bool = conn
    .query_row(
      "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
      params![key],
      |_| Ok(true),
    )
    .unwrap_or(false);
  if exists {
    conn
      .execute(
        "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
        params![key],
      )
      .map_err(|e| format!("could_not_remove_favorite: {e}"))?;
    Ok(false)
  } else {
    conn
      .execute(
        "INSERT INTO favorite_catalog_entries (catalog_key, title, added_at) \
         VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        params![key, payload.title],
      )
      .map_err(|e| format!("could_not_add_favorite: {e}"))?;
    Ok(true)
  }
}

#[tauri::command]
pub fn list_favorite_catalog_entries(app: AppHandle) -> Result<Vec<FavoriteCatalogEntryDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT catalog_key, title, added_at FROM favorite_catalog_entries ORDER BY added_at DESC",
    )
    .map_err(|e| format!("could_not_prepare_favorites: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok(FavoriteCatalogEntryDto {
        catalog_key: row.get(0)?,
        title: row.get(1)?,
        added_at: row.get(2)?,
      })
    })
    .map_err(|e| format!("could_not_query_favorites: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_favorites: {e}"))?;
  Ok(rows)
}

#[tauri::command]
pub fn create_collection(
  app: AppHandle,
  payload: CreateCollectionPayload,
) -> Result<CollectionDto, String> {
  let name = payload.name.trim();
  if name.is_empty() {
    return Err("collection_name_required".to_string());
  }
  let id = new_collection_id(name);
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO game_collections (id, name, created_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
      params![id, name],
    )
    .map_err(|e| format!("could_not_create_collection: {e}"))?;
  Ok(CollectionDto {
    id,
    name: name.to_string(),
    entry_count: 0,
  })
}

#[tauri::command]
pub fn rename_collection(app: AppHandle, payload: RenameCollectionPayload) -> Result<(), String> {
  let name = payload.name.trim();
  if name.is_empty() {
    return Err("collection_name_required".to_string());
  }
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "UPDATE game_collections SET name = ?1 WHERE id = ?2",
      params![name, payload.id],
    )
    .map_err(|e| format!("could_not_rename_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn delete_collection(app: AppHandle, payload: CollectionIdPayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute("DELETE FROM game_collections WHERE id = ?1", params![payload.id])
    .map_err(|e| format!("could_not_delete_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn list_collections(app: AppHandle) -> Result<Vec<CollectionDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT gc.id, gc.name, COUNT(ce.catalog_key) \
       FROM game_collections gc \
       LEFT JOIN collection_entries ce ON ce.collection_id = gc.id \
       GROUP BY gc.id ORDER BY gc.created_at DESC",
    )
    .map_err(|e| format!("could_not_prepare_collections: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      Ok(CollectionDto {
        id: row.get(0)?,
        name: row.get(1)?,
        entry_count: row.get(2)?,
      })
    })
    .map_err(|e| format!("could_not_query_collections: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_collections: {e}"))?;
  Ok(rows)
}

#[tauri::command]
pub fn add_to_collection(app: AppHandle, payload: CollectionEntryPayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT OR IGNORE INTO collection_entries (collection_id, catalog_key, title) \
       VALUES (?1, ?2, ?3)",
      params![payload.collection_id, payload.catalog_key, payload.title],
    )
    .map_err(|e| format!("could_not_add_to_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn remove_from_collection(
  app: AppHandle,
  payload: CollectionEntryPayload,
) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM collection_entries WHERE collection_id = ?1 AND catalog_key = ?2",
      params![payload.collection_id, payload.catalog_key],
    )
    .map_err(|e| format!("could_not_remove_from_collection: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn list_collection_entries(
  app: AppHandle,
  payload: CollectionIdPayload,
) -> Result<Vec<CollectionEntryDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT catalog_key, title FROM collection_entries \
       WHERE collection_id = ?1 ORDER BY title ASC",
    )
    .map_err(|e| format!("could_not_prepare_collection_entries: {e}"))?;
  let rows = stmt
    .query_map(params![payload.id], |row| {
      Ok(CollectionEntryDto {
        catalog_key: row.get(0)?,
        title: row.get(1)?,
      })
    })
    .map_err(|e| format!("could_not_query_collection_entries: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_collection_entries: {e}"))?;
  Ok(rows)
}

pub fn record_catalog_snapshot(conn: &Connection, source_id: &str, entry_count: i64, hash: &str) {
  let _ = conn.execute(
    "INSERT INTO catalog_sync_snapshots (source_id, entry_count, payload_hash, synced_at) \
     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP) \
     ON CONFLICT(source_id) DO UPDATE SET \
       entry_count = excluded.entry_count, \
       payload_hash = excluded.payload_hash, \
       synced_at = excluded.synced_at",
    params![source_id, entry_count, hash],
  );
}

#[tauri::command]
pub fn check_catalog_changes(app: AppHandle) -> Result<Vec<CatalogChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT hds.id, hds.name, hds.download_count, \
              COALESCE(css.entry_count, 0) \
       FROM hydra_download_sources hds \
       LEFT JOIN catalog_sync_snapshots css ON css.source_id = hds.id",
    )
    .map_err(|e| format!("could_not_prepare_catalog_changes: {e}"))?;
  let rows: Vec<(String, String, i64, i64)> = stmt
    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
    .map_err(|e| format!("could_not_query_catalog_changes: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_catalog_changes: {e}"))?;

  let mut changes = Vec::new();
  for (source_id, source_name, current_count, prev_count) in rows {
    if current_count > prev_count {
      changes.push(CatalogChangeDto {
        source_id,
        source_name,
        new_count: current_count - prev_count,
      });
    }
  }
  Ok(changes)
}
