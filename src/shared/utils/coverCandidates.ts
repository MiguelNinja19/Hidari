import { steamLibraryCoverUrls } from '../config/steamCovers'

export function extractSteamAppId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null
  return coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1] ?? null
}

/**
 * Candidatos de capa: library vertical primeiro; se faltar (404), header/capsule
 * (muitos jogos Steam não têm library_600x900).
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
  for (const url of steam) push(url)
  push(trimmed)
  return out
}

/** Usa screenshot/header quando não há capa dedicada. */
export function coverUrlFromScreenshots(
  coverUrl?: string | null,
  screenshots?: string[] | null,
  headerImage?: string | null,
): string | null {
  const existing = coverUrl?.trim()
  if (existing) return existing
  const header = headerImage?.trim()
  if (header) return header
  const shot = screenshots?.find((url) => url.trim().length > 0)?.trim()
  return shot || null
}
