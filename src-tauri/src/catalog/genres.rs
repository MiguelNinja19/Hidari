use crate::dto::{ResolvedGenreDto, ResolveGenresBatchPayload};
use tauri::AppHandle;

pub(crate) fn looks_like_source_label(genre: &str) -> bool {
  let value = genre.trim().to_lowercase();
  value.is_empty()
    || [
      "fitgirl", "repack", "dodi", "elamigos", "online-fix", "steam",
      "catálogo", "catalogo",
    ]
    .iter()
    .any(|hint| value.contains(hint))
}

#[tauri::command]
pub async fn resolve_game_genres_batch(
  app: AppHandle,
  payload: ResolveGenresBatchPayload,
) -> Result<Vec<ResolvedGenreDto>, String> {
  let mut pending: Vec<String> = payload
    .titles
    .into_iter()
    .map(|title| title.trim().to_string())
    .filter(|title| !title.is_empty())
    .take(32)
    .collect();
  let mut out = Vec::with_capacity(pending.len());
  while !pending.is_empty() {
    let batch: Vec<String> = pending.drain(..pending.len().min(4)).collect();
    let handles: Vec<_> = batch
      .into_iter()
      .map(|title| {
        let app = app.clone();
        tokio::spawn(async move {
          let genre = match super::steam_details::resolve_steam_details_for_app(
            &app, &title, None,
          )
          .await
          {
            Some(details) if !details.genres.is_empty() => details.genres.join(", "),
            _ => String::new(),
          };
          ResolvedGenreDto { title, genre }
        })
      })
      .collect();
    for handle in handles {
      if let Ok(item) = handle.await {
        out.push(item);
      }
    }
  }
  Ok(out)
}
