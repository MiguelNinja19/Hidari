export function extractSteamAppId(coverUrl?: string | null): string | null {
  if (!coverUrl) return null
  return coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1] ?? null
}

export function buildCoverCandidates(coverUrl?: string | null): string[] {
  if (!coverUrl) return []
  const appId = extractSteamAppId(coverUrl)
  if (!appId) return [coverUrl]
  return [
    ...new Set([
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`,
      coverUrl,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
      `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    ]),
  ]
}
