use crate::db::{
  fetch_source_by_id, get_disabled_hydra_source_ids_from_conn, open_database_connection,
};
use crate::dto::*;
use crate::sources::{
  create_local_hydra_source, fetch_options_from_sources, hydra_check_download_sources_changes,
  list_hydra_sources, load_source_by_id, load_sources, search_download_options_from_local_sources,
  set_source_status, upsert_hydra_source, validate_source_url,
};
use rusqlite::params;
use tauri::AppHandle;
use tokio::time::Duration;

#[tauri::command]
pub fn add_source(app: AppHandle, payload: AddSourcePayload) -> Result<SourceDto, String> {
  validate_source_url(&payload.base_url)?;
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "INSERT INTO download_sources (name, base_url, status) VALUES (?1, ?2, 'active')",
      params![payload.name, payload.base_url],
    )
    .map_err(|e| format!("could_not_insert_source: {e}"))?;
  fetch_source_by_id(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_sources(app: AppHandle) -> Result<Vec<SourceDto>, String> {
  let conn = open_database_connection(&app)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, name, base_url, status, created_at FROM download_sources ORDER BY id DESC",
    )
    .map_err(|e| format!("could_not_prepare_list_sources: {e}"))?;
  let result = stmt
    .query_map([], |row| {
      Ok(SourceDto {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
      })
    })
    .map_err(|e| format!("could_not_query_sources: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("could_not_map_sources: {e}"));
  result
}

#[tauri::command]
pub fn remove_source(app: AppHandle, payload: RemoveSourcePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute("DELETE FROM download_sources WHERE id = ?1", params![payload.id])
    .map_err(|e| format!("could_not_remove_source: {e}"))?;
  Ok(())
}

#[tauri::command]
pub async fn test_download_source(
  app: AppHandle,
  payload: TestSourcePayload,
) -> Result<TestSourceResultDto, String> {
  let conn = open_database_connection(&app)?;
  let source = load_source_by_id(&conn, payload.id)?;
  drop(conn);

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .build()
    .map_err(|error| format!("could_not_create_http_client: {error}"))?;

  let base = source.base_url.trim_end_matches('/');
  let started = std::time::Instant::now();

  // Primeiro tenta health, fallback para search.
  let primary = client.get(format!("{base}/health")).send().await;
  let response = match primary {
    Ok(resp) => Ok(("health".to_string(), resp)),
    Err(_) => client
      .get(format!("{base}/search"))
      .query(&[("query", "test"), ("gameId", "0")])
      .send()
      .await
      .map(|resp| ("search".to_string(), resp)),
  };

  match response {
    Ok((path_used, resp)) => {
      let latency = started.elapsed().as_millis();
      let code = resp.status().as_u16();
      let ok = resp.status().is_success();
      let status = if ok { "active" } else { "failed" };
      set_source_status(&app, source.id, status);

      Ok(TestSourceResultDto {
        source_id: source.id,
        ok,
        status_code: Some(code),
        latency_ms: latency,
        message: if ok {
          format!("Conexao ok via /{path_used}")
        } else {
          format!("Fonte respondeu com HTTP {code} em /{path_used}")
        },
      })
    }
    Err(error) => {
      set_source_status(&app, source.id, "failed");
      Ok(TestSourceResultDto {
        source_id: source.id,
        ok: false,
        status_code: None,
        latency_ms: started.elapsed().as_millis(),
        message: format!("Falha de conexao: {error}"),
      })
    }
  }
}

#[tauri::command]
pub async fn get_download_sources_changes(app: AppHandle) -> Result<Vec<GameSourceChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let games: Vec<(i64, String)> = {
    let mut stmt = conn
      .prepare("SELECT id, title FROM games ORDER BY id ASC")
      .map_err(|error| format!("could_not_prepare_games_query: {error}"))?;
    let rows = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|error| format!("could_not_query_games: {error}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("could_not_map_games: {error}"))?;
    rows
  };
  let sources = load_sources(&conn)?;
  drop(conn);

  let mut changes: Vec<GameSourceChangeDto> = Vec::new();
  for (game_id, game_title) in games {
    let options = fetch_options_from_sources(&app, game_id, &game_title, &sources).await;
    let count = options.len() as i64;

    let conn = open_database_connection(&app)?;
    conn
      .execute(
        "INSERT INTO download_source_changes (game_id, new_count, updated_at) \
         VALUES (?1, ?2, CURRENT_TIMESTAMP) \
         ON CONFLICT(game_id) DO UPDATE SET new_count = excluded.new_count, updated_at = CURRENT_TIMESTAMP",
        params![game_id, count],
      )
      .map_err(|error| format!("could_not_upsert_source_change: {error}"))?;

    changes.push(GameSourceChangeDto {
      game_id,
      new_download_options_count: count,
    });
  }

  Ok(changes)
}

#[tauri::command]
pub async fn search_game_download_options(
  app: AppHandle,
  payload: SearchGameOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let conn = open_database_connection(&app)?;
  let game_title: String = conn
    .query_row(
      "SELECT title FROM games WHERE id = ?1",
      params![payload.game_id],
      |row| row.get(0),
    )
    .map_err(|error| format!("could_not_find_game: {error}"))?;
  let sources = load_sources(&conn)?;
  drop(conn);

  Ok(fetch_options_from_sources(&app, payload.game_id, &game_title, &sources).await)
}

#[tauri::command]
pub async fn search_download_options(
  app: AppHandle,
  payload: SearchDownloadOptionsPayload,
) -> Result<Vec<DownloadOptionDto>, String> {
  let query = payload.query.trim();
  if query.len() < 2 {
    return Ok(Vec::new());
  }

  let conn = open_database_connection(&app)?;
  let hydra_sources = list_hydra_sources(&conn)?;
  let disabled = get_disabled_hydra_source_ids_from_conn(&conn)?;
  drop(conn);

  let active_sources: Vec<HydraSourceDto> = hydra_sources
    .into_iter()
    .filter(|source| !disabled.contains(&source.id))
    .collect();

  if active_sources.is_empty() {
    return Ok(Vec::new());
  }

  Ok(search_download_options_from_local_sources(query, &active_sources).await)
}

#[tauri::command]
pub async fn add_download_source(
  app: AppHandle,
  payload: AddDownloadSourcePayload,
) -> Result<HydraSourceDto, String> {
  validate_source_url(&payload.url)?;
  let source = create_local_hydra_source(&payload.url);
  let conn = open_database_connection(&app)?;
  upsert_hydra_source(&conn, &source)?;
  Ok(source)
}

#[tauri::command]
pub fn get_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

#[tauri::command]
pub async fn sync_download_sources(app: AppHandle) -> Result<Vec<HydraSourceDto>, String> {
  let conn = open_database_connection(&app)?;
  list_hydra_sources(&conn)
}

#[tauri::command]
pub async fn check_download_sources_changes(app: AppHandle) -> Result<Vec<GameSourceChangeDto>, String> {
  let conn = open_database_connection(&app)?;
  let sources = list_hydra_sources(&conn)?;
  let source_ids: Vec<String> = sources.into_iter().map(|source| source.id).collect();
  if source_ids.is_empty() {
    return Ok(Vec::new());
  }

  let games: Vec<(i64, String)> = {
    let mut stmt = conn
      .prepare("SELECT id, title FROM games ORDER BY id ASC")
      .map_err(|error| format!("could_not_prepare_games_query: {error}"))?;
    let result = stmt
      .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
      .map_err(|error| format!("could_not_query_games: {error}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("could_not_map_games: {error}"))?;
    result
  };

  if games.is_empty() {
    return Ok(Vec::new());
  }

  let raw_changes = hydra_check_download_sources_changes(&source_ids, &games).await?;
  let mut changes: Vec<GameSourceChangeDto> = Vec::new();

  for (game_id, count) in raw_changes {
    conn
      .execute(
        "INSERT INTO download_source_changes (game_id, new_count, updated_at) \
         VALUES (?1, ?2, CURRENT_TIMESTAMP) \
         ON CONFLICT(game_id) DO UPDATE SET new_count = excluded.new_count, updated_at = CURRENT_TIMESTAMP",
        params![game_id, count],
      )
      .map_err(|error| format!("could_not_upsert_source_change: {error}"))?;
    changes.push(GameSourceChangeDto {
      game_id,
      new_download_options_count: count,
    });
  }

  Ok(changes)
}

#[tauri::command]
pub fn remove_download_source(app: AppHandle, payload: RemoveHydraSourcePayload) -> Result<(), String> {
  let conn = open_database_connection(&app)?;
  conn
    .execute(
      "DELETE FROM hydra_download_sources WHERE id = ?1",
      params![payload.id],
    )
    .map_err(|error| format!("could_not_remove_hydra_source: {error}"))?;
  Ok(())
}
