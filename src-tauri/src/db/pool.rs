use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::migrations::run_database_migrations;
use super::pragmas::apply_connection_pragmas;

pub struct DbPool(r2d2::Pool<SqliteConnectionManager>);

pub type DbConnection = r2d2::PooledConnection<SqliteConnectionManager>;

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("could_not_get_app_data_dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("could_not_create_app_data_dir: {e}"))?;
  Ok(dir.join("launcher.db"))
}

/// Pool SQLite partilhado — reutiliza conexões entre invokes (Send-safe para async).
pub fn init_database_pool(app: &AppHandle) -> Result<(), String> {
  let path = database_path(app)?;
  let manager = SqliteConnectionManager::file(path);
  let pool = r2d2::Pool::builder()
    .max_size(6)
    .build(manager)
    .map_err(|e| format!("could_not_build_db_pool: {e}"))?;
  {
    let conn = pool
      .get()
      .map_err(|e| format!("could_not_get_db_connection: {e}"))?;
    apply_connection_pragmas(&conn)?;
    run_database_migrations(&conn)?;
  }
  app.manage(DbPool(pool));
  Ok(())
}

/// Obtém conexão do pool (libertar antes de `.await` em comandos async).
pub fn open_database_connection(app: &AppHandle) -> Result<DbConnection, String> {
  let pool = app
    .try_state::<DbPool>()
    .ok_or_else(|| "db_not_initialized".to_string())?;
  pool.0
    .get()
    .map_err(|e| format!("could_not_get_db_connection: {e}"))
}
