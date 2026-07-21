const COLON_SUFFIX_WORDS = new Set([
  'beyond', 'next', 'waypoint', 'leviathan', 'endurance', 'synthesis', 'vision', 'prisms',
  'worlds', 'frontiers', 'aberration', 'extinction', 'genesis', 'crystal', 'isle', 'scorched',
  'ragnarok', 'valguero', 'aquatica', 'ascendancy', 'specters', 'liberty', 'phantom',
  'rebirth', 'apocalypse', 'forsaken', 'royale', 'chapter', 'season', 'episode', 'operation',
  'protocol', 'overhaul', 'expansion', 'anniversary', 'remastered',
])

export function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[™®©'’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean).slice(0, 6).join(' ')
}

export function cleanTitleForCover(title: string): string {
  return title.replace(/\(.*?fitgirl.*?\)/gi, '').replace(/fitgirl[- ]?repack/gi, '')
    .replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim()
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&#0?38;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

const BASE_TITLE_RE =
  /^\s*(.+?)(?:\s*:\s*.*?\b(?:edition|remastered|remake|definitive|goty|game of the year|deluxe|ultimate|enhanced|complete collection)\b.*|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i
const VERSION_SUFFIX_RE = /\s+v(?:er(?:sion)?)?[\s.]*\d+(?:[\s._-]\d+)*(?:\s*-\s*)?.*$/i

export const stripTrailingVersionSuffix = (title: string) =>
  title.replace(VERSION_SUFFIX_RE, '').trim()

function stripColonUpdateSuffix(title: string): string {
  const trimmed = title.trim()
  const idx = trimmed.indexOf(':')
  if (idx < 0) return trimmed
  const after = trimmed.slice(idx + 1).trim()
  if (!after || after.includes(':') || after.split(/\s+/).length > 1) return trimmed
  return COLON_SUFFIX_WORDS.has(after.toLowerCase()) ? trimmed.slice(0, idx).trim() : trimmed
}

function extractOnce(title: string): string {
  const normalized = title.replace(/[™®©]/g, '').trim()
  if (!normalized) return ''
  return stripTrailingVersionSuffix(normalized.match(BASE_TITLE_RE)?.[1]?.trim() || normalized)
}

export function extractCatalogBaseTitle(title: string): string {
  let working = cleanTitleForCover(title).replace(/,?\s*builds?\s+[\d/]+/gi, '')
    .replace(/,?\s*\+?\s*\d+\s*dlcs?(?:\/bonuses?)?/gi, '')
    .replace(/,?\s*\+?\s*bonuses?/gi, '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 8; i += 1) {
    const next = stripColonUpdateSuffix(extractOnce(working))
    if (next === working) return next
    working = next
  }
  return working
}

export function cleanTitleForDisplay(title: string): string {
  let cleaned = decodeHtmlEntities(title).replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/\[.*?\]/g, '').replace(/fitgirl[- ]?repack/gi, '')
    .replace(/,?\s*builds?\s+[\d/]+/gi, '').replace(/,?\s*\+?\s*\d+\s*dlcs?(?:\/bonuses?)?/gi, '')
    .replace(/,?\s*\+?\s*bonuses?/gi, '').replace(/\s*\+\s*$/g, '')
    .replace(/\s*,\s*,/g, ',').replace(/\s+/g, ' ').trim()
  cleaned = stripTrailingVersionSuffix(cleaned)
  return cleaned || title.trim()
}

export function catalogGameDisplayTitle(title: string): string {
  return extractCatalogBaseTitle(title).split(/\s+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}
