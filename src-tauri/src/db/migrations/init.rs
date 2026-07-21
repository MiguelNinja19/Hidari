use rusqlite::Connection;

use super::cache::migrate_catalog_steam_cache_hd_covers;
use super::group_keys::migrate_catalog_group_keys;
use super::super::pragmas::apply_connection_pragmas;

pub(crate) fn initialize_database(conn: &Connection) -> Result<(), String> {
  apply_connection_pragmas(conn)?;
  super::init_core::create_core_tables(conn)?;
  super::init_aux::create_aux_tables(conn)?;
  migrate_catalog_steam_cache_hd_covers(conn)?;
  migrate_catalog_group_keys(conn)
}
