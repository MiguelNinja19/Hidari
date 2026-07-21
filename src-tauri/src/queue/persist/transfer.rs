use rusqlite::Connection;

use super::schema::ensure_persisted_queue_table;

fn is_fully_transferred(bytes_downloaded: i64, total_bytes: i64) -> bool {
  const MIN_CONTENT_BYTES: i64 = 5 * 1024 * 1024;
  // Estrito: só “não restaurar” quando os bytes batem certo.
  // O 0.995 da UI é outra história (barra/%); aqui um falso positivo
  // deixaria um download a meio sem retomar.
  total_bytes >= MIN_CONTENT_BYTES
    && bytes_downloaded >= MIN_CONTENT_BYTES
    && bytes_downloaded >= total_bytes
}

/// Jobs com transferência real concluída deixam de ser “resumíveis”.
pub(super) fn finalize_fully_transferred_persisted_jobs(conn: &Connection) -> Result<usize, String> {
  ensure_persisted_queue_table(conn)?;
  let changed = conn
    .execute(
      "UPDATE persisted_queue_jobs \
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP \
       WHERE status IN ('paused', 'pending', 'downloading', 'retrying', 'seeding') \
         AND total_bytes >= 5242880 \
         AND bytes_downloaded >= 5242880 \
         AND bytes_downloaded >= total_bytes",
      [],
    )
    .map_err(|e| format!("could_not_finalize_persisted_jobs: {e}"))?;
  Ok(changed)
}

pub(super) fn is_fully_transferred_job(bytes_downloaded: i64, total_bytes: i64) -> bool {
  is_fully_transferred(bytes_downloaded, total_bytes)
}
