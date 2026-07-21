use super::{finalize_fully_transferred_persisted_jobs, is_fully_transferred_bytes};
use rusqlite::Connection;

#[test]
fn fully_transferred_requires_exact_bytes_and_min_size() {
  let big = 618_035_125_i64;
  assert!(is_fully_transferred_bytes(big, big));
  assert!(!is_fully_transferred_bytes(big - 1, big));
  // 99.6% ainda incompleto — não finaliza
  assert!(!is_fully_transferred_bytes(((big as f64) * 0.996) as i64, big));
  // Metadados pequeninos nunca contam
  assert!(!is_fully_transferred_bytes(32_708, 32_708));
  assert!(!is_fully_transferred_bytes(0, 0));
}

#[test]
fn finalize_marks_complete_seeding_but_keeps_incomplete() {
  let conn = Connection::open_in_memory().unwrap();
  conn.execute_batch(
    "CREATE TABLE persisted_queue_jobs (
       id TEXT PRIMARY KEY NOT NULL,
       title TEXT NOT NULL,
       url TEXT NOT NULL,
       dest_path TEXT NOT NULL,
       status TEXT NOT NULL,
       priority INTEGER NOT NULL DEFAULT 0,
       progress INTEGER NOT NULL DEFAULT 0,
       bytes_downloaded INTEGER NOT NULL DEFAULT 0,
       total_bytes INTEGER NOT NULL DEFAULT 0,
       error_msg TEXT,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     );",
  )
  .unwrap();

  conn.execute(
    "INSERT INTO persisted_queue_jobs \
       (id, title, url, dest_path, status, progress, bytes_downloaded, total_bytes) \
     VALUES \
       ('done', 'Terraria', 'magnet:?x', 'J:\\\\dddd', 'seeding', 100, 618035125, 618035125), \
       ('mid', 'Half', 'magnet:?y', 'J:\\\\dddd', 'paused', 50, 300000000, 618035125), \
       ('tiny', 'Meta', 'magnet:?z', 'J:\\\\dddd', 'seeding', 100, 32708, 32708)",
    [],
  )
  .unwrap();

  let n = finalize_fully_transferred_persisted_jobs(&conn).unwrap();
  assert_eq!(n, 1);

  let done_status: String = conn
    .query_row(
      "SELECT status FROM persisted_queue_jobs WHERE id='done'",
      [],
      |r| r.get(0),
    )
    .unwrap();
  let mid_status: String = conn
    .query_row(
      "SELECT status FROM persisted_queue_jobs WHERE id='mid'",
      [],
      |r| r.get(0),
    )
    .unwrap();
  let tiny_status: String = conn
    .query_row(
      "SELECT status FROM persisted_queue_jobs WHERE id='tiny'",
      [],
      |r| r.get(0),
    )
    .unwrap();

  assert_eq!(done_status, "completed");
  assert_eq!(mid_status, "paused");
  assert_eq!(tiny_status, "seeding");
}
