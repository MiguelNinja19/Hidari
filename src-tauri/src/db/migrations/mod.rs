mod cache;
mod feature;
mod group_keys;
mod init;
mod init_aux;
mod init_core;
mod legacy;
mod schema;

use rusqlite::Connection;
use std::sync::OnceLock;

use init::initialize_database;
use schema::migrate_schema;

static MIGRATIONS_DONE: OnceLock<()> = OnceLock::new();

pub(crate) fn run_database_migrations(conn: &Connection) -> Result<(), String> {
  if MIGRATIONS_DONE.get().is_some() {
    return Ok(());
  }
  initialize_database(conn)?;
  migrate_schema(conn)?;
  crate::sources::hydra::ensure_default_hydra_sources(conn)?;
  let _ = MIGRATIONS_DONE.set(());
  Ok(())
}
