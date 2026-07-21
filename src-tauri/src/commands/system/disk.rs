use crate::dto::DiskPathPayload;
use std::path::Path;
use sysinfo::Disks;

/// Espaço livre no volume que contém o caminho (bytes). Útil para mostrar no UI de pastas.
#[tauri::command]
pub fn get_disk_free_bytes_for_path(payload: DiskPathPayload) -> Result<Option<u64>, String> {
  let path_arg = payload.path.trim();
  if path_arg.is_empty() {
    return Ok(None);
  }
  let path = Path::new(path_arg);
  if path == Path::new("") {
    return Ok(None);
  }
  let candidate = if path.exists() {
    path
      .canonicalize()
      .map_err(|e| format!("disk_path_error: {e}"))?
  } else {
    let mut p = path.to_path_buf();
    if !p.has_root() {
      return Ok(None);
    }
    while p.parent().is_some() && !p.as_path().exists() {
      if let Some(parent) = p.parent() {
        p = parent.to_path_buf();
      } else {
        break;
      }
    }
    p
  };

  let s = candidate.to_string_lossy().to_string();
  #[cfg(windows)]
  let s_norm: String = s.to_lowercase();
  #[cfg(not(windows))]
  let s_norm = s;

  let disks = Disks::new_with_refreshed_list();
  let mut best: Option<(usize, u64)> = None;
  for disk in disks.list() {
    let m = disk.mount_point().to_string_lossy();
    #[cfg(windows)]
    let m_norm: String = m.to_lowercase();
    #[cfg(not(windows))]
    let m_norm: String = m.to_string();
    if s_norm.starts_with(m_norm.as_str()) {
      let len = m_norm.len();
      if best.map_or(true, |(best_len, _)| len > best_len) {
        best = Some((len, disk.available_space()));
      }
    }
  }
  Ok(best.map(|(_, space)| space))
}
