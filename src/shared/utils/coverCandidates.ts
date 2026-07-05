import { steamLibraryCoverUrls } from '../config/steamCovers'

export function extractSteamAppId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null
  return coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1] ?? null
}

export function buildCoverCandidates(coverUrl?: string | null): string[] {
  if (!coverUrl) return []
  const appId = extractSteamAppId(coverUrl)
  if (!appId) return [coverUrl]
  return [...new Set([...steamLibraryCoverUrls(appId), coverUrl])]
}
