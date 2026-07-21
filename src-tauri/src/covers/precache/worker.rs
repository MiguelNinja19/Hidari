use super::{CoverPrecacheSnapshot, CoverPrecacheState, Outcome};
use crate::db::open_database_connection;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

fn emit_progress(app: &AppHandle, state: &CoverPrecacheState) {
  let _ = app.emit("cover-precache-progress", state.status());
}

fn finish(app: &AppHandle, state: &CoverPrecacheState) {
  state.update(|snapshot| snapshot.running = false);
  state.worker_running.store(false, Ordering::Release);
  emit_progress(app, state);
}

async fn run_once(app: AppHandle, state: CoverPrecacheState) {
  let dir = match super::super::covers_dir_for_app(&app) {
    Ok(dir) => dir,
    Err(_) => {
      finish(&app, &state);
      return;
    }
  };
  let work = match open_database_connection(&app)
    .and_then(|conn| super::titles_pending_precache(&conn, &dir))
  {
    Ok(work) => work,
    Err(_) => {
      finish(&app, &state);
      return;
    }
  };
  let total = work.len();
  state.update(|snapshot| *snapshot = CoverPrecacheSnapshot {
    running: true,
    total,
    ..Default::default()
  });
  emit_progress(&app, &state);
  for (index, title) in work.into_iter().enumerate() {
    if state.cancel.load(Ordering::Acquire) {
      break;
    }
    let outcome = super::process_title(&app, &title, &dir).await;
    state.update(|snapshot| {
      snapshot.processed += 1;
      match outcome {
        Outcome::Cached => snapshot.cached += 1,
        Outcome::Downloaded => snapshot.downloaded += 1,
        Outcome::Unresolved => snapshot.unresolved += 1,
        Outcome::Failed => snapshot.failed += 1,
      }
    });
    if index % 3 == 2 || index + 1 == total {
      emit_progress(&app, &state);
    }
  }
  finish(&app, &state);
}

pub async fn run_cover_precache(app: AppHandle, state: CoverPrecacheState) {
  loop {
    if state.worker_running
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .is_err()
    {
      return;
    }
    state.cancel.store(false, Ordering::Release);
    run_once(app.clone(), state.clone()).await;
    if !state.rerun_requested.swap(false, Ordering::AcqRel) {
      break;
    }
  }
}

pub fn spawn_cover_precache(app: AppHandle, state: CoverPrecacheState) {
  tauri::async_runtime::spawn(run_cover_precache(app, state));
}

pub fn maybe_start_cover_precache(app: &AppHandle) {
  let Some(state) = app.try_state::<CoverPrecacheState>() else { return };
  if state.worker_running.load(Ordering::Acquire) {
    state.rerun_requested.store(true, Ordering::Release);
  } else {
    spawn_cover_precache(app.clone(), state.inner().clone());
  }
}
