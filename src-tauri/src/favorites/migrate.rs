use rusqlite::params;
use std::collections::HashMap;

use super::key::catalog_key_for;

/// Normaliza e deduplica favoritos legados no arranque.
pub fn migrate_favorite_catalog_entries(conn: &rusqlite::Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT catalog_key, title, added_at FROM favorite_catalog_entries")
        .map_err(|e| format!("could_not_prepare_favorites_migrate: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("could_not_query_favorites_migrate: {e}"))?;

    let mut by_canonical: HashMap<String, (String, String, String)> = HashMap::new();
    let mut obsolete_keys: Vec<String> = Vec::new();

    for row in rows.flatten() {
        let (catalog_key, title, added_at) = row;
        let canonical = catalog_key_for(&title, Some(&catalog_key));
        if canonical.is_empty() {
            obsolete_keys.push(catalog_key);
            continue;
        }
        if let Some((existing_key, _, existing_added)) = by_canonical.get(&canonical) {
            if existing_key != &catalog_key {
                if added_at > *existing_added {
                    obsolete_keys.push(existing_key.clone());
                    by_canonical.insert(canonical, (catalog_key, title, added_at));
                } else {
                    obsolete_keys.push(catalog_key);
                }
            }
        } else {
            by_canonical.insert(canonical, (catalog_key, title, added_at));
        }
    }

    for key in obsolete_keys {
        let _ = conn.execute(
            "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
            params![key],
        );
    }

    for (canonical, (old_key, title, _)) in by_canonical {
        if canonical == old_key {
            continue;
        }
        let occupied: bool = conn
            .query_row(
                "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
                params![&canonical],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if occupied {
            let _ = conn.execute(
                "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
                params![&old_key],
            );
        } else {
            let _ = conn.execute(
        "UPDATE favorite_catalog_entries SET catalog_key = ?1, title = ?2 WHERE catalog_key = ?3",
        params![&canonical, &title, &old_key],
      );
        }
    }

    Ok(())
}
