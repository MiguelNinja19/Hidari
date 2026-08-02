/**
 * Tipos para Download Extras (debrid + hosters).
 */

export type DebridService = 'RealDebrid' | 'AllDebrid' | 'TorBox' | 'Premiumize' | 'Offcloud'

export interface ResolvedDownload {
  download_url: string
  filename?: string | null
  file_size?: number | null
  resolved_by: string
}

export interface DebridCredentials {
  real_debrid_token?: string | null
  all_debrid_token?: string | null
  torbox_token?: string | null
  premiumize_token?: string | null
  offcloud_token?: string | null
}
