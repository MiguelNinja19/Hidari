const GENRE_HINT =
  /ação|action|aventura|adventure|rpg|simula|simulation|estrat|strategy|terror|horror|indie|corrida|racing|esporte|sports|puzzle|plataforma|platform|roguelike|fps|mmo|casual|sobreviv|survival|narrativ|fighting|luta|metroidvania/i

const SOURCE_NAME_HINT =
  /fitgirl|repack|repacks|dodi|elamigos|online-fix|cs\.rin|steamunlocked|gog|kaos|empress|tenoke|rune/i

export function isLikelySourceLabel(genreLine: string): boolean {
  const value = genreLine.trim().toLowerCase()
  if (!value) return false
  return SOURCE_NAME_HINT.test(value)
}

export function splitGenreParts(genreLine: string): string[] {
  const normalized = genreLine
    .split(/\s*[•|,/]\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized.slice(0, 3) : []
}

export function formatGenreParts(genreLine: string): string {
  const parts = splitGenreParts(genreLine)
  return parts.length > 0 ? parts.join(' • ') : ''
}

export function isLikelyGameGenre(genreLine: string): boolean {
  const value = genreLine.trim()
  if (!value || isLikelySourceLabel(value)) return false
  if (value === 'Steam' || value === 'Catálogo') return false
  if (value.includes(',') || value.includes('•')) return true
  return GENRE_HINT.test(value)
}

export function resolveDiscoverGenreDisplay(genre: string): string | null {
  const trimmed = genre.trim()
  if (!trimmed || isLikelySourceLabel(trimmed)) return null
  if (trimmed === 'Steam' || trimmed === 'Catálogo') return null

  const formatted = formatGenreParts(trimmed)
  if (!formatted) return null

  if (trimmed.includes(',')) return formatted
  return isLikelyGameGenre(trimmed) ? formatted : null
}

export function pickGenreLine(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && resolveDiscoverGenreDisplay(value)) return value
  }
  return ''
}
