export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©'’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
}

const COLON_UPDATE_SUFFIX_WORDS = new Set([
  'beyond',
  'next',
  'waypoint',
  'leviathan',
  'endurance',
  'synthesis',
  'vision',
  'prisms',
  'worlds',
  'frontiers',
  'aberration',
  'extinction',
  'genesis',
  'crystal',
  'isle',
  'scorched',
  'ragnarok',
  'valguero',
  'aquatica',
  'ascendancy',
  'specters',
  'liberty',
  'phantom',
  'rebirth',
  'apocalypse',
  'forsaken',
  'royale',
  'chapter',
  'season',
  'episode',
  'operation',
  'protocol',
  'overhaul',
  'expansion',
  'anniversary',
  'remastered',
])

const TRAILING_NOISE_TOKENS = new Set([
  ...COLON_UPDATE_SUFFIX_WORDS,
  'update',
  'updates',
  'patch',
  'patches',
  'hotfix',
  'repack',
  'build',
  'builds',
  'dlc',
  'dlcs',
  'bonus',
  'bonuses',
  'rmulti',
  'part',
  'chapter',
  'episode',
  'season',
  'pack',
  'bundle',
  'remaster',
  'i',
  'ii',
  'iii',
  'iv',
])

function isVersionFragmentToken(token: string): boolean {
  const t = token.toLowerCase()
  if (t.startsWith('v') && t.length > 1) {
    return [...t.slice(1)].every((c) => /\d|\./.test(c))
  }
  if (t.includes('.')) {
    return [...t].every((c) => /\d|\./.test(c))
  }
  return false
}

function isTrailingNoiseToken(token: string): boolean {
  const t = token.toLowerCase()
  if (TRAILING_NOISE_TOKENS.has(t)) return true
  if (isVersionFragmentToken(t)) return true
  if (t.startsWith('multi') && t.length <= 8) return true
  return false
}

function canonicalCatalogGroupKey(groupKey: string): string {
  const tokens = groupKey.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1]!.toLowerCase()
    const prev = tokens[tokens.length - 2]!.toLowerCase()
    if (prev === 'sky' && ['origins', 'beyond', 'next', 'waypoint'].includes(last)) {
      tokens.pop()
    }
  }

  let afterVersion = false
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]!
    const lower = last.toLowerCase()
    if (isTrailingNoiseToken(lower)) {
      tokens.pop()
      afterVersion = isVersionFragmentToken(lower)
      continue
    }
    if (afterVersion && /^\d{1,3}$/.test(lower)) {
      tokens.pop()
      afterVersion = false
      continue
    }
    break
  }
  return tokens.join(' ')
}

/** Alias de chaves de capa (repack barulhento → nome limpo do jogo). */
export function coverStorageKeyAliases(titleKey: string): string[] {
  const trimmed = titleKey.trim()
  if (!trimmed) return []
  const aliases = [trimmed]
  const canonical = canonicalCatalogGroupKey(trimmed)
  if (canonical && canonical !== trimmed) aliases.push(canonical)
  return aliases
}

function stripColonUpdateSuffix(title: string): string {
  const trimmed = title.trim()
  const idx = trimmed.indexOf(':')
  if (idx < 0) return trimmed
  const after = trimmed.slice(idx + 1).trim()
  if (!after || after.includes(':')) return trimmed
  if (after.split(/\s+/).length > 1) return trimmed
  if (COLON_UPDATE_SUFFIX_WORDS.has(after.toLowerCase())) {
    return trimmed.slice(0, idx).trim()
  }
  return trimmed
}

function extractCatalogBaseTitleOnce(title: string): string {
  const normalized = title.replace(/[™®©]/g, '').trim()
  if (!normalized) return ''
  const match = normalized.match(CATALOG_BASE_TITLE_RE)
  const base = match?.[1]?.trim() || normalized
  return stripTrailingVersionSuffix(base)
}

export function cleanTitleForCover(title: string): string {
  return title
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai o nome do jogo: remove edições/versões/repack, mas mantém subtítulos (ex.: Spider-Man: Miles Morales). */
const CATALOG_BASE_TITLE_RE =
  /^\s*(.+?)(?:\s*:\s*.*?\b(?:edition|remastered|remake|definitive|goty|game of the year|deluxe|ultimate|enhanced|complete collection)\b.*|\s*-\s+(?:v?\d[\d.]*|fitgirl|update|repack|build\b).+|\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i

/** Remove sufixo de versão e tudo o que vier depois (ex.: "V1 0 466", "v1.4.4.1 - Labor of Love"). */
const TRAILING_VERSION_SUFFIX_RE =
  /\s+v(?:er(?:sion)?)?[\s.]*\d+(?:[\s._-]\d+)*(?:\s*-\s*)?.*$/i

function stripTrailingVersionSuffix(title: string): string {
  return title.replace(TRAILING_VERSION_SUFFIX_RE, '').trim()
}

function extractCatalogBaseTitle(title: string): string {
  let working = cleanTitleForCover(title)
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/,?\s*builds?\s+[\d/]+/gi, '')
    .replace(/,?\s*\+?\s*\d+\s*dlcs?(?:\/bonuses?)?/gi, '')
    .replace(/,?\s*\+?\s*bonuses?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!working) return ''

  for (let i = 0; i < 8; i += 1) {
    const next = stripColonUpdateSuffix(extractCatalogBaseTitleOnce(working))
    if (next === working) return next
    working = next
  }
  return working
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
  return canonicalCatalogGroupKey(normalizeTitleKey(extractCatalogBaseTitle(title)))
}

/** Chaves possíveis para o mesmo jogo (repack, pasta, job). */
export function libraryGameKeyCandidates(title: string): string[] {
  const display = cleanTitleForDisplay(title)
  const base = extractCatalogBaseTitle(display)
  const baseNorm = normalizeTitleKey(base || '')
  const fullNorm = normalizeTitleKey(display || title.trim())
  const seen = new Set<string>()
  const out: string[] = []
  const push = (key: string) => {
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(key)
  }

  const baseTokens = baseNorm.split(/\s+/).filter((word) => word.length >= 4)
  if (baseTokens.length === 1) {
    push(baseTokens[0]!)
  } else if (baseTokens.length >= 2) {
    push(baseTokens.slice(0, 2).join(' '))
  }

  const fullTokens = fullNorm.split(/\s+/).filter((word) => word.length >= 4)
  if (fullTokens.length >= 3) {
    push(fullTokens.slice(-3).join(' '))
  } else if (fullTokens.length === 2) {
    push(fullTokens.join(' '))
  } else if (fullTokens.length === 1) {
    push(fullTokens[0]!)
  }

  if (out.length === 0 && fullNorm) {
    push(fullNorm.split(/\s+/).slice(0, 3).join(' ') || fullNorm)
  }
  return out
}

export function libraryTitlesMatch(a: string, b: string): boolean {
  const keysA = new Set(libraryGameKeyCandidates(a))
  if (libraryGameKeyCandidates(b).some((key) => keysA.has(key))) return true
  return libraryTitlePrefixMatch(a, b)
}

/** Abreviações de pasta (ex.: "Stardew") vs título completo do job/repack. */
function libraryTitlePrefixMatch(a: string, b: string): boolean {
  const baseA = normalizeTitleKey(extractCatalogBaseTitle(cleanTitleForDisplay(a)))
  const baseB = normalizeTitleKey(extractCatalogBaseTitle(cleanTitleForDisplay(b)))
  if (!baseA || !baseB) return false
  if (baseA === baseB) return true

  const tokensA = baseA.split(/\s+/).filter(Boolean)
  const tokensB = baseB.split(/\s+/).filter(Boolean)
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]

  if (shorter.length === 0 || longer.length === 0) return false

  const prefixMatches = shorter.every((token, index) => longer[index] === token)
  if (!prefixMatches) return false

  // Evita falsos positivos com palavras muito curtas ("The", "Of").
  const significant = shorter.filter((token) => token.length >= 4)
  if (significant.length === 0) {
    return shorter.length === 1 && shorter[0]!.length >= 3
  }
  return true
}

/** Chave principal para agrupar o mesmo jogo na biblioteca. */
export function libraryGameKey(title: string): string {
  return libraryGameKeyCandidates(title)[0] ?? normalizeTitleKey(title)
}
