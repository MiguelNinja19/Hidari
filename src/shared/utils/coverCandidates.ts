import { steamLibraryCoverUrls } from '../config/steamCovers'

export function extractSteamAppId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null
  return coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1] ?? null
}

/** Um único candidato principal — menos retries HTTP e menos flicker. */
export function buildCoverCandidates(coverUrl?: string | null): string[] {
  if (!coverUrl) return []
  const trimmed = coverUrl.trim()
  if (!trimmed) return []
  const appId = extractSteamAppId(trimmed)
  if (!appId) return [trimmed]
  const [primary] = steamLibraryCoverUrls(appId)
  return primary && primary !== trimmed ? [primary] : [trimmed]
}
