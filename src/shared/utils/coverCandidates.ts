import { steamLibraryCoverUrls } from '../config/steamCovers'

export function extractSteamAppId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null
  return coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1] ?? null
}

/** Header/capsule/hero — horizontais; na grelha 2:3 ficam com zoom excessivo. */
export function isLandscapeSteamCoverUrl(url: string): boolean {
  return /\/(header|capsule_[^/]+|library_hero|page_bg)/i.test(url)
}

function isPortraitSteamCoverUrl(url: string): boolean {
  return /library_600x900/i.test(url)
}

/**
 * Candidatos de capa para a grelha (2:3).
 * - URL do catálogo / Hydra / vertical: essa primeiro (não trocar por outra app Steam).
 * - Header/capsule Steam: promove library_600x900 da mesma app, para evitar zoom.
 */
export function buildCoverCandidates(coverUrl?: string | null): string[] {
  if (!coverUrl) return []
  const trimmed = coverUrl.trim()
  if (!trimmed) return []
  const appId = extractSteamAppId(trimmed)
  if (!appId) return [trimmed]

  const steam = steamLibraryCoverUrls(appId)
  const out: string[] = []
  const push = (url: string) => {
    if (url && !out.includes(url)) out.push(url)
  }

  if (isLandscapeSteamCoverUrl(trimmed)) {
    for (const url of steam) {
      if (isPortraitSteamCoverUrl(url)) push(url)
    }
    push(trimmed)
    for (const url of steam) push(url)
    return out
  }

  push(trimmed)
  for (const url of steam) push(url)
  return out
}

/** Usa capa dedicada; se só houver header Steam, promove a library 600×900. */
export function coverUrlFromScreenshots(
  coverUrl?: string | null,
  screenshots?: string[] | null,
  headerImage?: string | null,
): string | null {
  const existing = coverUrl?.trim()
  if (existing) {
    const appId = extractSteamAppId(existing)
    if (appId && isLandscapeSteamCoverUrl(existing)) {
      return steamLibraryCoverUrls(appId)[0] ?? existing
    }
    return existing
  }
  const header = headerImage?.trim()
  if (header) {
    const appId = extractSteamAppId(header)
    if (appId) return steamLibraryCoverUrls(appId)[0] ?? header
    return header
  }
  const shot = screenshots?.find((url) => url.trim().length > 0)?.trim()
  return shot || null
}
