use super::types::{HydraLinksCatalog, HydraLinksDownload};
use rusqlite::{params, Connection};
use std::collections::HashMap;

pub(crate) fn catalog_from_indexed_entries(
  conn: &Connection,
  source_id: &str,
  source_name: &str,
) -> Result<HydraLinksCatalog, String> {
  let mut stmt = conn
    .prepare(
      "SELECT title, file_size, uris_json FROM hydra_catalog_entries \
       WHERE source_id = ?1 ORDER BY title COLLATE NOCASE",
    )
    .map_err(|error| format!("could_not_prepare_catalog_entries: {error}"))?;

  let rows = stmt
    .query_map(params![source_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, Option<String>>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .map_err(|error| format!("could_not_query_catalog_entries: {error}"))?;

  let mut by_title: HashMap<String, HydraLinksDownload> = HashMap::new();
  for row in rows.flatten() {
    let (title, file_size, uris_json) = row;
    let uris: Vec<String> = serde_json::from_str(&uris_json).unwrap_or_default();
    let entry = by_title
      .entry(title.clone())
      .or_insert_with(|| HydraLinksDownload {
        title,
        file_size: None,
        uris: Vec::new(),
        upload_date: None,
      });
    if entry
      .file_size
      .as_ref()
      .map(String::as_str)
      .unwrap_or("")
      .is_empty()
    {
      if let Some(size) = file_size.filter(|value| !value.trim().is_empty()) {
        entry.file_size = Some(size);
      }
    }
    for uri in uris {
      if !entry.uris.iter().any(|existing| existing == &uri) {
        entry.uris.push(uri);
      }
    }
  }

  let mut downloads: Vec<HydraLinksDownload> = by_title.into_values().collect();
  downloads.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

  Ok(HydraLinksCatalog {
    name: Some(source_name.to_string()),
    downloads,
  })
}
