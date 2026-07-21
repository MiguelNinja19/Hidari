import type { CatalogGame, GetGameDetailInput } from '../../shared/types/contracts'
import { catalogGameGroupKey } from '../../shared/utils/normalizeTitleKey'

export function catalogDedupeKey(game: CatalogGame): string {
  return catalogGameGroupKey(game.groupKey?.trim() || game.title)
}

export function dedupeCatalogGames(games: CatalogGame[]): CatalogGame[] {
  const seen = new Set<string>()
  return games.filter((game) => {
    const key = catalogDedupeKey(game)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mergeCatalogGames(base: CatalogGame[], incoming: CatalogGame[]) {
  return dedupeCatalogGames([...base, ...incoming])
}

export function mergeInitialCatalog(
  cached: CatalogGame[],
  fresh: CatalogGame[],
): CatalogGame[] {
  const cachedByKey = new Map(cached.map((game) => [catalogDedupeKey(game), game]))
  return dedupeCatalogGames(
    fresh.map((game) => {
      const existing = cachedByKey.get(catalogDedupeKey(game))
      return existing
        ? {
            ...game,
            coverUrl: game.coverUrl?.trim() || existing.coverUrl,
            localCoverPath: game.localCoverPath?.trim() || existing.localCoverPath,
            groupKey: game.groupKey?.trim() || existing.groupKey,
          }
        : game
    }),
  )
}

export function catalogGameFromInput(
  input: GetGameDetailInput | CatalogGame,
  catalogGames: CatalogGame[],
): CatalogGame {
  if ('source' in input) return input
  const groupKey = input.groupKey?.trim()
  const title = input.title?.trim() ?? ''
  const match = catalogGames.find(
    (game) =>
      (groupKey && game.groupKey === groupKey) ||
      (title && game.title.localeCompare(title, undefined, { sensitivity: 'base' }) === 0),
  )
  return (
    match ?? {
      id: groupKey ? `group:${groupKey}` : `title:${title}`,
      title,
      genre: '',
      coverUrl: null,
      localCoverPath: null,
      source: 'catalog',
      groupKey: groupKey || null,
    }
  )
}
