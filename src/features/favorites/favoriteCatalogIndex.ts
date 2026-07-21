import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'
import {
  favoriteCatalogKeyForEntry,
  favoriteCatalogKeyForGame,
} from '../../shared/utils/favoriteCatalogKey'

export type FavoriteGame = Pick<CatalogGame, 'title' | 'groupKey' | 'id'>

export function normalizeFavoriteTitle(title: string): string {
  return title.trim().toLowerCase()
}

export function buildFavoriteIndex(entries: FavoriteCatalogEntry[]) {
  const keys = new Set<string>()
  const titles = new Set<string>()
  for (const entry of entries) {
    keys.add(favoriteCatalogKeyForEntry(entry.title, entry.catalogKey))
    const title = normalizeFavoriteTitle(entry.title)
    if (title) titles.add(title)
  }
  return { keys, titles }
}

export function gameIsFavorite(
  game: FavoriteGame,
  keys: ReadonlySet<string>,
  titles: ReadonlySet<string>,
) {
  const key = favoriteCatalogKeyForGame(game)
  if (keys.has(key)) return true
  const title = normalizeFavoriteTitle(game.title)
  return title.length > 0 && titles.has(title)
}
