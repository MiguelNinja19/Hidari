/** Sites oficiais onde a senha do arquivo costuma estar descrita. */
const SOURCE_PASSWORD_SITES: Array<{ match: RegExp; name: string; url: string }> = [
  { match: /fitgirl/i, name: 'FitGirl', url: 'https://fitgirl-repacks.site/' },
  { match: /dodi/i, name: 'DODI', url: 'https://dodi-repacks.site/' },
  { match: /xatab/i, name: 'XATAB', url: 'https://byxatab.com/' },
  { match: /elamigos/i, name: 'ElAmigos', url: 'https://elamigos.site/' },
  { match: /kaos.?krew/i, name: 'KaOsKrew', url: 'https://kaoskrew.org/' },
  { match: /steamrip/i, name: 'SteamRIP', url: 'https://steamrip.com/' },
  { match: /online.?fix/i, name: 'Online-Fix', url: 'https://online-fix.me/' },
  { match: /gog[-\s]?games/i, name: 'GOG Games', url: 'https://gog-games.to/' },
]

export type SourcePasswordHint = {
  name: string
  url: string
}

/** Infere a fonte pelo nome do job / sourceName (ex.: título com FitGirl). */
export function resolveSourcePasswordHint(
  ...parts: Array<string | null | undefined>
): SourcePasswordHint | null {
  const haystack = parts.filter(Boolean).join(' ')
  if (!haystack.trim()) return null
  for (const entry of SOURCE_PASSWORD_SITES) {
    if (entry.match.test(haystack)) {
      return { name: entry.name, url: entry.url }
    }
  }
  return null
}
