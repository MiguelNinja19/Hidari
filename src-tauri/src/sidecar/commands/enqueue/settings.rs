use crate::dto::SidecarEnqueuePayload;
use rusqlite::Connection;

pub(crate) struct EnqueueSettings {
  pub dest_path: String,
  pub seed_enabled: bool,
  pub max_speed_bps: Option<u64>,
}

pub(crate) fn load_enqueue_settings(
  conn: &Connection,
  payload: &SidecarEnqueuePayload,
) -> Result<EnqueueSettings, String> {
  let default_dest_path = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'default_download_path'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok();
  let seed_enabled = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'seed_torrents_enabled'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE"))
    .unwrap_or(true);
  let max_speed_bps = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'download_speed_limit_bps'",
      [],
      |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse::<u64>().ok())
    .filter(|&v| v > 0);
  let dest_path = payload
    .dest_path
    .clone()
    .or(default_dest_path)
    .ok_or_else(|| "default_download_path_not_configured".to_string())?;

  Ok(EnqueueSettings {
    dest_path,
    seed_enabled,
    max_speed_bps,
  })
}
