pub(crate) fn normalize_sidecar_progress(
  progress: f64,
  bytes_downloaded: i64,
  total_bytes: i64,
  status: &str,
) -> f64 {
  if total_bytes > 0 && bytes_downloaded >= 0 {
    return ((bytes_downloaded as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0);
  }

  let pct = if progress > 0.0 && progress <= 1.0 {
    progress * 100.0
  } else {
    progress
  };

  let active = matches!(status, "downloading" | "pending" | "retrying" | "paused");

  if bytes_downloaded <= 0 && total_bytes <= 0 && active && pct >= 99.0 {
    return 0.0;
  }

  if bytes_downloaded <= 0 && total_bytes > 0 && active && pct >= 100.0 {
    return 0.0;
  }

  pct.clamp(0.0, 100.0)
}
