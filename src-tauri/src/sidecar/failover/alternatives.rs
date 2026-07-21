use crate::db::open_database_connection;
use crate::dto::HydraSourceDto;
use crate::sources::hydra::list_hydra_sources;
use crate::sources::search_download_options_from_local_sources;
use crate::sources::validate_job_url;
use std::collections::HashSet;
use tauri::AppHandle;

use super::url::url_fingerprint;

pub(crate) struct FailoverAlternative {
  pub url: String,
  pub source_name: String,
}

pub(crate) async fn find_failover_alternative(
  app: &AppHandle,
  title: &str,
  current_url: &str,
) -> Result<FailoverAlternative, String> {
  let used = url_fingerprint(current_url);
  let sources: Vec<HydraSourceDto> = {
    let conn = open_database_connection(app)?;
    list_hydra_sources(&conn).unwrap_or_default()
  };
  if sources.is_empty() {
    return Err("no_sources_for_failover".into());
  }

  let options = search_download_options_from_local_sources(app, title, &sources).await;
  let mut seen = HashSet::new();
  seen.insert(used);

  let alternative = options.into_iter().find(|opt| {
    let fp = url_fingerprint(&opt.url);
    if seen.contains(&fp) {
      return false;
    }
    seen.insert(fp);
    validate_job_url(&opt.url).is_ok()
  });

  alternative
    .map(|alt| FailoverAlternative {
      url: alt.url,
      source_name: alt.source_name,
    })
    .ok_or_else(|| "no_alternate_source".into())
}
