/**
 * Tipos para integração Steam.
 * Espelham os structs Rust em src-tauri/src/steam/mod.rs.
 */

export interface SteamInstall {
  path: string
  user_ids: string[]
  library_folders: string[]
}

export interface AppManifest {
  appid: string
  name: string
  installdir: string
  size_on_disk: number
  last_updated: number
  buildid: string
  install_path: string
  library_folder: string
}

export interface ScanResult {
  manifests: AppManifest[]
  scanned_libraries: string[]
}

export interface ImportResult {
  imported_count: number
  skipped_count: number
  errors: string[]
}
