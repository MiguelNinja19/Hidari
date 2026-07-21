use crate::db::open_database_connection;
use crate::queue::persist::delete_persisted_queue_job;
use tauri::AppHandle;

pub(crate) async fn remove_old_job(
  app: &AppHandle,
  client: &reqwest::Client,
  port: u16,
  job_id: &str,
) -> Result<(), String> {
  let _ = client
    .delete(format!("http://127.0.0.1:{port}/jobs/{job_id}"))
    .send()
    .await;
  if let Ok(conn) = open_database_connection(app) {
    let _ = delete_persisted_queue_job(&conn, job_id);
  }
  Ok(())
}
