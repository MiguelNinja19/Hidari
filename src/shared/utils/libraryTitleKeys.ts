import {
  cleanTitleForDisplay,
  extractCatalogBaseTitle,
  normalizeTitleKey,
} from './titleNormalizationCore'

export function libraryGameKeyCandidates(title: string): string[] {
  const display = cleanTitleForDisplay(title)
  const baseNorm = normalizeTitleKey(extractCatalogBaseTitle(display) || '')
  const fullNorm = normalizeTitleKey(display || title.trim())
  const out: string[] = []
  const push = (key: string) => {
    if (key && !out.includes(key)) out.push(key)
  }
  const baseTokens = baseNorm.split(/\s+/).filter((word) => word.length >= 4)
  if (baseTokens.length === 1) push(baseTokens[0]!)
  else if (baseTokens.length >= 2) push(baseTokens.slice(0, 2).join(' '))

  const fullTokens = fullNorm.split(/\s+/).filter((word) => word.length >= 4)
  if (fullTokens.length >= 3) push(fullTokens.slice(-3).join(' '))
  else if (fullTokens.length === 2) push(fullTokens.join(' '))
  else if (fullTokens.length === 1) push(fullTokens[0]!)
  if (out.length === 0 && fullNorm) push(fullNorm.split(/\s+/).slice(0, 3).join(' ') || fullNorm)
  return out
}

function libraryTitlePrefixMatch(a: string, b: string): boolean {
  const baseA = normalizeTitleKey(extractCatalogBaseTitle(cleanTitleForDisplay(a)))
  const baseB = normalizeTitleKey(extractCatalogBaseTitle(cleanTitleForDisplay(b)))
  if (!baseA || !baseB) return false
  if (baseA === baseB) return true
  const tokensA = baseA.split(/\s+/).filter(Boolean)
  const tokensB = baseB.split(/\s+/).filter(Boolean)
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  if (!shorter.every((token, index) => longer[index] === token)) return false
  const significant = shorter.filter((token) => token.length >= 4)
  return significant.length > 0 || (shorter.length === 1 && shorter[0]!.length >= 3)
}

export function libraryTitlesMatch(a: string, b: string): boolean {
  const keysA = new Set(libraryGameKeyCandidates(a))
  return libraryGameKeyCandidates(b).some((key) => keysA.has(key)) || libraryTitlePrefixMatch(a, b)
}

export const libraryGameKey = (title: string) =>
  libraryGameKeyCandidates(title)[0] ?? normalizeTitleKey(title)
