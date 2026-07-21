use crate::dto::{DownloadOptionDto, HydraSourceDto};
use tauri::AppHandle;

/// Tempo máximo para a API Hydra ao listar opções de download (picker / detalhe).
const DOWNLOAD_OPTIONS_API_MS: u64 = 8_000;

pub async fn search_download_options_from_local_sources(
  app: &AppHandle,
  query: &str,
  sources: &[HydraSourceDto],
) -> Vec<DownloadOptionDto> {
  let app = app.clone();
  let query = query.to_string();
  let mut local_active = Vec::new();
  let mut api_candidates = Vec::new();

  for source in sources {
    if super::hydralinks::has_local_catalog(&app, &source.id) {
      local_active.push(source.clone());
    }
    if source
      .api_source_id
      .as_ref()
      .is_some_and(|value| !value.is_empty())
    {
      api_candidates.push(source.clone());
    }
  }

  let app_local = app.clone();
  let query_local = query.clone();
  let local_fut = async move {
    let mut local_options = Vec::new();
    if local_active.len() == 1 {
      local_options.extend(super::hydralinks::search_json_catalog_source(
        &app_local,
        &local_active[0],
        &query_local,
      ));
    } else if !local_active.is_empty() {
      let mut join_set = tokio::task::JoinSet::new();
      for source in local_active {
        let app_bg = app_local.clone();
        let query_bg = query_local.clone();
        join_set.spawn_blocking(move || {
          super::hydralinks::search_json_catalog_source(&app_bg, &source, &query_bg)
        });
      }

      while let Some(result) = join_set.join_next().await {
        if let Ok(mut chunk) = result {
          local_options.append(&mut chunk);
        }
      }
    }
    local_options
  };

  let app_api = app.clone();
  let query_api = query.clone();
  let api_fut = async move {
    if api_candidates.is_empty() {
      return Vec::new();
    }
    let api_future =
      super::hydra::search_download_options_via_api(&app_api, &api_candidates, &query_api);
    match tokio::time::timeout(
      std::time::Duration::from_millis(DOWNLOAD_OPTIONS_API_MS),
      api_future,
    )
    .await
    {
      Ok(options) => options,
      Err(_) => {
        eprintln!("hydra_download_search_timeout: query={query_api}");
        Vec::new()
      }
    }
  };

  let api_handle = tokio::spawn(api_fut);
  let local_options = local_fut.await;
  let api_options = api_handle.await.unwrap_or_else(|_| Vec::new());

  let mut all = Vec::new();
  let mut seen_urls = std::collections::HashSet::new();
  for option in local_options.into_iter().chain(api_options) {
    if seen_urls.insert(option.url.clone()) {
      all.push(option);
    }
  }

  all
}
