use rusqlite::params;

use super::key::{favorite_identity_keys, row_matches_favorite_identity};

pub fn favorite_exists(conn: &rusqlite::Connection, key: &str, title: &str) -> bool {
    let identities = favorite_identity_keys(key, title);
    if conn
        .query_row(
            "SELECT 1 FROM favorite_catalog_entries WHERE catalog_key = ?1",
            params![key],
            |_| Ok(true),
        )
        .unwrap_or(false)
    {
        return true;
    }

    let Ok(mut stmt) = conn.prepare("SELECT catalog_key, title FROM favorite_catalog_entries")
    else {
        return false;
    };
    let Ok(rows) = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) else {
        return false;
    };
    for row in rows.flatten() {
        if row_matches_favorite_identity(&row.0, &row.1, &identities) {
            return true;
        }
    }
    false
}

pub fn delete_favorite_rows(
    conn: &rusqlite::Connection,
    key: &str,
    title: &str,
) -> Result<(), String> {
    let identities = favorite_identity_keys(key, title);
    let mut keys_to_delete: Vec<String> = Vec::new();

    let mut stmt = conn
        .prepare("SELECT catalog_key, title FROM favorite_catalog_entries")
        .map_err(|e| format!("could_not_prepare_favorites_delete: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("could_not_query_favorites_delete: {e}"))?;

    for row in rows.flatten() {
        if row_matches_favorite_identity(&row.0, &row.1, &identities) {
            keys_to_delete.push(row.0);
        }
    }

    for catalog_key in keys_to_delete {
        conn.execute(
            "DELETE FROM favorite_catalog_entries WHERE catalog_key = ?1",
            params![catalog_key],
        )
        .map_err(|e| format!("could_not_remove_favorite: {e}"))?;
    }

    conn.execute(
        "DELETE FROM favorite_catalog_entries WHERE lower(trim(title)) = lower(trim(?1))",
        params![title],
    )
    .map_err(|e| format!("could_not_remove_favorite: {e}"))?;
    Ok(())
}
