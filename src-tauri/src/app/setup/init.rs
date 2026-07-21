use tauri::AppHandle;

pub fn run_migrations_and_repairs(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  crate::path_security::migrate_legacy_app_data(app)?;
  crate::db::init_database_pool(app)?;
  if let (Ok(conn), Ok(covers_dir)) = (
    crate::db::open_database_connection(app),
    crate::covers::covers_dir_for_app(app),
  ) {
    match crate::covers::repair_corrupt_cover_paths(&conn, &covers_dir) {
      Ok(n) if n > 0 => eprintln!("cover_paths_repaired: {n} entradas inválidas limpas"),
      Err(error) => eprintln!("cover_paths_repair_failed: {error}"),
      _ => {}
    }
    match crate::covers::repair_corrupt_cover_urls(&conn) {
      Ok(n) if n > 0 => eprintln!("cover_urls_repaired: {n} URLs inválidas removidas"),
      Err(error) => eprintln!("cover_urls_repair_failed: {error}"),
      _ => {}
    }
  }
  Ok(())
}
