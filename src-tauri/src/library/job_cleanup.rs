use super::path_match::job_matches;
use crate::queue::persist::ensure_persisted_queue_table;
use rusqlite::{params, Connection};

fn matching_job_ids(conn: &Connection, sql: &str, path: &str, title: &str) -> Vec<String> {
    let Ok(mut stmt) = conn.prepare(sql) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    }) else {
        return Vec::new();
    };
    rows.flatten()
        .filter(|row| job_matches(path, title, &row.2, &row.1))
        .map(|row| row.0)
        .collect()
}

pub(crate) fn purge_jobs(conn: &Connection, path: &str, title: &str) {
    let _ = ensure_persisted_queue_table(conn);
    let mut ids = matching_job_ids(
        conn,
        "SELECT id, title, dest_path FROM persisted_queue_jobs",
        path,
        title,
    );
    for id in matching_job_ids(
        conn,
        "SELECT CAST(id AS TEXT), title, dest_path FROM download_jobs",
        path,
        title,
    ) {
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    for id in ids {
        let _ = conn.execute("DELETE FROM extraction_log WHERE job_id = ?1", params![id]);
        let _ = conn.execute(
            "DELETE FROM download_jobs WHERE CAST(id AS TEXT) = ?1",
            params![id],
        );
        let _ = conn.execute(
            "DELETE FROM persisted_queue_jobs WHERE id = ?1",
            params![id],
        );
    }
}
