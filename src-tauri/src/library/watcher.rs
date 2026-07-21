use crate::db::get_default_download_path;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const LIBRARY_FOLDER_CHANGED: &str = "library://folder-changed";

const DEBOUNCE_MS: u64 = 1500;

fn watch_download_folder_blocking(app: &AppHandle) {
    let Some(path) = get_default_download_path(app)
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
    else {
        return;
    };

    let (tx, rx) = mpsc::channel();
    let mut watcher = match RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            if result.is_ok() {
                let _ = tx.send(());
            }
        },
        Config::default(),
    ) {
        Ok(value) => value,
        Err(_) => return,
    };

    if watcher
        .watch(Path::new(&path), RecursiveMode::NonRecursive)
        .is_err()
    {
        return;
    }

    let mut last_emit = Instant::now() - Duration::from_secs(60);
    while rx.recv().is_ok() {
        while rx.try_recv().is_ok() {}

        if last_emit.elapsed() < Duration::from_millis(DEBOUNCE_MS) {
            continue;
        }
        last_emit = Instant::now();
        let _ = app.emit(LIBRARY_FOLDER_CHANGED, ());
    }
}

pub fn spawn_download_folder_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let app_for_watch = app.clone();
            let _ =
                tokio::task::spawn_blocking(move || watch_download_folder_blocking(&app_for_watch))
                    .await;
            tokio::time::sleep(Duration::from_secs(20)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::LIBRARY_FOLDER_CHANGED;

    #[test]
    fn library_folder_changed_event_name() {
        assert_eq!(LIBRARY_FOLDER_CHANGED, "library://folder-changed");
    }
}
