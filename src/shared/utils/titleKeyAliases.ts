import {
  cleanTitleForCover,
  cleanTitleForDisplay,
  extractCatalogBaseTitle,
  normalizeTitleKey,
  stripTrailingVersionSuffix,
} from './titleNormalizationCore'

const NOISE = new Set([
  'beyond', 'next', 'waypoint', 'leviathan', 'endurance', 'synthesis', 'vision', 'prisms',
  'worlds', 'frontiers', 'aberration', 'extinction', 'genesis', 'crystal', 'isle', 'scorched',
  'ragnarok', 'valguero', 'aquatica', 'ascendancy', 'specters', 'liberty', 'phantom',
  'rebirth', 'apocalypse', 'forsaken', 'royale', 'chapter', 'season', 'episode', 'operation',
  'protocol', 'overhaul', 'expansion', 'anniversary', 'remastered', 'update', 'updates',
  'patch', 'patches', 'hotfix', 'repack', 'build', 'builds', 'dlc', 'dlcs', 'bonus',
  'bonuses', 'rmulti', 'part', 'pack', 'bundle', 'remaster', 'i', 'ii', 'iii', 'iv',
])

const isVersion = (token: string) => {
  const value = token.toLowerCase()
  if (value.startsWith('v') && value.length > 1) {
    return [...value.slice(1)].every((char) => /\d|\./.test(char))
  }
  return value.includes('.') && [...value].every((char) => /\d|\./.test(char))
}

const isNoise = (token: string) =>
  NOISE.has(token.toLowerCase()) ||
  isVersion(token) ||
  (token.toLowerCase().startsWith('multi') && token.length <= 8)

export function canonicalCatalogGroupKey(groupKey: string): string {
  const tokens = groupKey.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    const last = tokens.at(-1)!.toLowerCase()
    const previous = tokens.at(-2)!.toLowerCase()
    if (previous === 'sky' && ['origins', 'beyond', 'next', 'waypoint'].includes(last)) tokens.pop()
  }
  let afterVersion = false
  while (tokens.length > 0) {
    const last = tokens.at(-1)!.toLowerCase()
    if (isNoise(last)) {
      tokens.pop()
      afterVersion = isVersion(last)
    } else if (afterVersion && /^\d{1,3}$/.test(last)) {
      tokens.pop()
      afterVersion = false
    } else break
  }
  return tokens.join(' ')
}

export function coverStorageKeyAliases(titleKey: string): string[] {
  const trimmed = titleKey.trim()
  if (!trimmed) return []
  const canonical = canonicalCatalogGroupKey(trimmed)
  return canonical && canonical !== trimmed ? [trimmed, canonical] : [trimmed]
}

export const coverTitleKey = (title: string) => {
  const clean = cleanTitleForCover(title)
  return normalizeTitleKey(extractCatalogBaseTitle(clean) || clean || title.trim())
}

export function coverTitleKeyCandidates(title: string): string[] {
  const trimmed = title.trim()
  if (!trimmed) return []
  const values = [
    extractCatalogBaseTitle(cleanTitleForCover(trimmed)),
    cleanTitleForCover(trimmed),
    stripTrailingVersionSuffix(cleanTitleForDisplay(trimmed)),
    trimmed,
  ]
  return [...new Set(values.map(normalizeTitleKey).filter(Boolean))]
}

export const catalogGameGroupKey = (title: string) =>
  canonicalCatalogGroupKey(normalizeTitleKey(extractCatalogBaseTitle(title)))
