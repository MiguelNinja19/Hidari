/**
 * Tipos para Cloud Save.
 * Espelham os structs Rust em src-tauri/src/cloud_save/mod.rs.
 */

export type BackendType = 'Local' | 'Webdav' | 'Hydra'

export interface ArtifactMetadata {
  id: string
  label: string
  size_bytes: number
  created_at: number
  hostname: string
  is_frozen: boolean
}

export interface UploadResult {
  artifact_id: string
  size_bytes: number
}

export interface CloudSaveSettings {
  backend: BackendType
  local_folder?: string | null
  webdav_url?: string | null
  webdav_username?: string | null
  webdav_password?: string | null
  hydra_token?: string | null
}
