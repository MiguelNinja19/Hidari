use crate::dto::CoverPrecacheStatusDto;
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverPrecacheSnapshot {
  pub running: bool,
  pub total: usize,
  pub processed: usize,
  pub cached: usize,
  pub downloaded: usize,
  pub unresolved: usize,
  pub failed: usize,
}

#[derive(Clone)]
pub struct CoverPrecacheState {
  pub(crate) cancel: Arc<AtomicBool>,
  pub(crate) worker_running: Arc<AtomicBool>,
  pub(crate) rerun_requested: Arc<AtomicBool>,
  snapshot: Arc<Mutex<CoverPrecacheSnapshot>>,
}

impl Default for CoverPrecacheState {
  fn default() -> Self {
    Self {
      cancel: Arc::new(AtomicBool::new(false)),
      worker_running: Arc::new(AtomicBool::new(false)),
      rerun_requested: Arc::new(AtomicBool::new(false)),
      snapshot: Arc::new(Mutex::new(CoverPrecacheSnapshot::default())),
    }
  }
}

impl CoverPrecacheState {
  pub fn status(&self) -> CoverPrecacheStatusDto {
    let value = self.snapshot.lock().unwrap().clone();
    CoverPrecacheStatusDto {
      running: value.running,
      total: value.total,
      processed: value.processed,
      cached: value.cached,
      downloaded: value.downloaded,
      unresolved: value.unresolved,
      failed: value.failed,
    }
  }

  pub(crate) fn update(&self, update: impl FnOnce(&mut CoverPrecacheSnapshot)) {
    update(&mut self.snapshot.lock().unwrap());
  }
}
