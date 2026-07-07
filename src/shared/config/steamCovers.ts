/** Templates CDN Steam — fonte única no frontend (mínimo de fallbacks para carregar rápido). */
export function steamLibraryCoverUrls(appId: string): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  ]
}
