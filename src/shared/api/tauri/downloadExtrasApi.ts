/**
 * Cliente Tauri para Download Extras.
 */

import { invoke } from '@tauri-apps/api/core'
import type { DebridCredentials, ResolvedDownload } from '../../types/contracts/downloadExtras'

export async function getDebridCredentials(): Promise<DebridCredentials> {
  return invoke<DebridCredentials>('get_debrid_credentials')
}

export async function setDebridCredentials(credentials: DebridCredentials): Promise<void> {
  return invoke<void>('set_debrid_credentials', { credentials })
}

export async function resolveWithDebrid(
  service: string,
  magnetOrUrl: string,
): Promise<ResolvedDownload> {
  return invoke<ResolvedDownload>('resolve_with_debrid', {
    service,
    magnetOrUrl,
  })
}

export async function detectHoster(url: string): Promise<string | null> {
  return invoke<string | null>('detect_hoster', { url })
}

export async function resolveHosterUrl(url: string): Promise<ResolvedDownload> {
  return invoke<ResolvedDownload>('resolve_hoster_url', { url })
}

export async function listDebridServices(): Promise<string[]> {
  return invoke<string[]>('list_debrid_services')
}
