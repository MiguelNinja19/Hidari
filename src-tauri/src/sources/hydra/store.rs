use super::HydraApiDownloadSource;
use crate::dto::HydraSourceDto;
use rusqlite::{params, Connection};

pub fn upsert_hydra_source(conn: &Connection, source: &HydraSourceDto) -> Result<(), String> {
  conn.execute(
    "INSERT INTO hydra_download_sources \
     (id,name,url,status,download_count,fingerprint,api_source_id,remote_url,created_at) \
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET \
     name=excluded.name,url=excluded.url,status=excluded.status,\
     download_count=excluded.download_count,fingerprint=excluded.fingerprint,\
     api_source_id=excluded.api_source_id,remote_url=excluded.remote_url",
    params![source.id, source.name, source.url, source.status, source.download_count,
      source.fingerprint, source.api_source_id, source.remote_url, source.created_at],
  ).map_err(|error| format!("could_not_upsert_hydra_source: {error}"))?;
  Ok(())
}

pub fn count_hydra_catalog_entries(conn: &Connection, source_id: &str) -> usize {
  conn.query_row(
    "SELECT COUNT(*) FROM hydra_catalog_entries WHERE source_id=?1",
    params![source_id],
    |row| row.get::<_, i64>(0),
  ).unwrap_or(0).max(0) as usize
}

pub fn persist_hydra_api_meta(
  conn: &Connection,
  source_id: &str,
  api: &HydraApiDownloadSource,
) -> Result<(), String> {
  let name = super::resolve_source_display_name(None, Some(&api.name), &api.name);
  let count = if api.download_count > 0 { api.download_count } else {
    count_hydra_catalog_entries(conn, source_id) as i64
  };
  conn.execute(
    "UPDATE hydra_download_sources SET api_source_id=?1,fingerprint=?2,\
     download_count=?3,status=?4,name=?5 WHERE id=?6",
    params![api.id, api.fingerprint, count, api.status, name, source_id],
  ).map_err(|error| format!("could_not_persist_hydra_api_meta: {error}"))?;
  Ok(())
}

pub fn persist_hydra_source_display_name(
  conn: &Connection, source_id: &str, name: &str,
) -> Result<(), String> {
  if !name.trim().is_empty() {
    conn.execute(
      "UPDATE hydra_download_sources SET name=?1 WHERE id=?2",
      params![name.trim(), source_id],
    ).map_err(|error| format!("could_not_persist_hydra_source_name: {error}"))?;
  }
  Ok(())
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HydraSourceDto> {
  Ok(HydraSourceDto {
    id: row.get(0)?, name: row.get(1)?, url: row.get(2)?, status: row.get(3)?,
    download_count: row.get(4)?, fingerprint: row.get(5)?, api_source_id: row.get(6)?,
    remote_url: row.get(7)?, created_at: row.get(8)?,
  })
}

const SOURCE_COLUMNS: &str =
  "id,name,url,status,download_count,fingerprint,api_source_id,remote_url,created_at";

pub fn list_hydra_sources(conn: &Connection) -> Result<Vec<HydraSourceDto>, String> {
  let mut stmt = conn.prepare(&format!(
    "SELECT {SOURCE_COLUMNS} FROM hydra_download_sources ORDER BY created_at DESC"
  )).map_err(|error| format!("could_not_prepare_list_hydra_sources: {error}"))?;
  let result = stmt.query_map([], map_row)
    .map_err(|error| format!("could_not_query_hydra_sources: {error}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| format!("could_not_map_hydra_sources: {error}"));
  result
}

pub fn get_hydra_source_by_id(conn: &Connection, id: &str) -> Result<HydraSourceDto, String> {
  conn.query_row(
    &format!("SELECT {SOURCE_COLUMNS} FROM hydra_download_sources WHERE id=?1"),
    params![id], map_row,
  ).map_err(|error| format!("could_not_find_hydra_source: {error}"))
}

pub fn ensure_default_hydra_sources(_: &Connection) -> Result<(), String> { Ok(()) }
