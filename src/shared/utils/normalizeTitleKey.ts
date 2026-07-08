export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
}

export function cleanTitleForCover(title: string): string {
  return title
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Um único regex: extrai só o nome do jogo. */
export const CATALOG_BASE_TITLE_RE =
  /^\s*(.+?)(?:\s*:\s*.+|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i

/** Remove sufixo de versão e tudo o que vier depois (ex.: "V1 0 466", "v1.4.4.1 - Labor of Love"). */
export const TRAILING_VERSION_SUFFIX_RE =
  /\s+v(?:er(?:sion)?)?[\s.]*\d+(?:[\s._-]\d+)*(?:\s*-\s*)?.*$/i

export function stripTrailingVersionSuffix(title: string): string {
  return title.replace(TRAILING_VERSION_SUFFIX_RE, '').trim()
}

export function extractCatalogBaseTitle(title: string): string {
  const normalized = decodeHtmlEntities(title.trim())
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  const match = normalized.match(CATALOG_BASE_TITLE_RE)
  const base = match?.[1]?.trim() || normalized
  return stripTrailingVersionSuffix(base)
}

export function catalogGameDisplayTitle(title: string): string {
  return formatCatalogDisplayName(extractCatalogBaseTitle(title))
}

function formatCatalogDisplayName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/** Título legível na UI — remove repack, builds, DLCs e ruído técnico. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#0?38;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function cleanTitleForDisplay(title: string): string {
  let cleaned = decodeHtmlEntities(title)
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/,?\s*builds?\s+[\d/]+/gi, '')
    .replace(/,?\s*\+?\s*\d+\s*dlcs?(?:\/bonuses?)?/gi, '')
    .replace(/,?\s*\+?\s*bonuses?/gi, '')
    .replace(/\s*\+\s*$/g, '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
  cleaned = stripTrailingVersionSuffix(cleaned)

  if (!cleaned) cleaned = title.trim()
  return cleaned
}

export function coverTitleKey(title: string): string {
  const base = extractCatalogBaseTitle(cleanTitleForCover(title))
  return normalizeTitleKey(base || cleanTitleForCover(title) || title.trim())
}

/** Chaves alternativas para encontrar capa em cache (repack vs nome limpo). */
export function coverTitleKeyCandidates(title: string): string[] {
  const trimmed = title.trim()
  if (!trimmed) return []

  const seen = new Set<string>()
  const keys: string[] = []
  const push = (value: string) => {
    const key = normalizeTitleKey(value)
    if (!key || seen.has(key)) return
    seen.add(key)
    keys.push(key)
  }

  push(extractCatalogBaseTitle(cleanTitleForCover(trimmed)))
  push(cleanTitleForCover(trimmed))
  push(stripTrailingVersionSuffix(cleanTitleForDisplay(trimmed)))
  push(trimmed)
  return keys
}

/** Chave de agrupamento do catálogo (espelha `catalog_game_group_key` no backend). */
export function catalogGameGroupKey(title: string): string {
  return normalizeTitleKey(extractCatalogBaseTitle(title))
}

/** Chave para agrupar o mesmo jogo na biblioteca (ex.: Terraria vs Terraria v1.4.5). */
export function libraryGameKey(title: string): string {
  let cleaned = cleanTitleForDisplay(title)
  cleaned = cleaned.replace(/\s*[-–:]\s*v?\d[\d.]*.*$/i, '').trim()
  const key = normalizeTitleKey(cleaned || title)
  const first = key.split(/\s+/)[0] ?? key
  return first.length >= 3 ? first : key
}
