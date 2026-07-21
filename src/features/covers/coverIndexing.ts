import type { GameCover } from '../../shared/types/contracts'
import { coverStorageKeyAliases, coverTitleKeyCandidates } from '../../shared/utils/normalizeTitleKey'

export function isSteamLibraryCoverUrl(url: string): boolean {
  return /steamstatic|steamcdn|cdn\.akamai\.steamstatic|steamcommunity|library_600x900/i.test(
    url,
  )
}

export function coverPreferenceRank(url: string): number {
  const trimmed = url.trim()
  if (!trimmed) return 99
  if (!isSteamLibraryCoverUrl(trimmed)) return 0
  if (/library_600x900/i.test(trimmed)) return 2
  return 1
}

export function findSavedCover(
  title: string,
  savedCovers: Record<string, GameCover>,
): GameCover | null {
  const matches: GameCover[] = []
  const seen = new Set<string>()
  for (const key of coverTitleKeyCandidates(title)) {
    const row = savedCovers[key]
    if (!row || seen.has(row.titleKey)) continue
    seen.add(row.titleKey)
    matches.push(row)
  }
  if (matches.length === 0) return null
  matches.sort(
    (a, b) => coverPreferenceRank(a.coverUrl) - coverPreferenceRank(b.coverUrl),
  )
  return matches[0] ?? null
}

/** Mantém a capa preferida (ex.: da pesquisa) — não deixa o resolve Steam sobrescrever. */
export function indexSavedCoverRows(
  map: Record<string, GameCover>,
  rows: GameCover[],
): Record<string, GameCover> {
  for (const row of rows) {
    for (const key of coverStorageKeyAliases(row.titleKey)) {
      const existing = map[key]
      if (!existing) {
        map[key] = row
        continue
      }

      const existingUrl = existing.coverUrl.trim()
      const nextUrl = row.coverUrl.trim()

      if (existingUrl === nextUrl) {
        if (!existing.localPath?.trim() && row.localPath?.trim()) {
          map[key] = { ...existing, localPath: row.localPath }
        }
        continue
      }

      const existingRank = coverPreferenceRank(existingUrl)
      const nextRank = coverPreferenceRank(nextUrl)

      if (nextRank > existingRank) continue
      if (nextRank === existingRank && existingRank > 0) continue

      map[key] = row
    }
  }
  return map
}
