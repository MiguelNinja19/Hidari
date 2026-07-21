import type {
  CatalogGame,
  DownloadOption,
  FavoriteCatalogEntry,
} from '../../shared/types/contracts'
import {
  favoriteCatalogKeyForEntry,
  favoriteCatalogKeyForGame,
  isUsableFavoriteCatalogKey,
} from '../../shared/utils/favoriteCatalogKey'

export type FavoriteDetailState = {
  game: CatalogGame
  loading: boolean
  error: string | null
  options: DownloadOption[]
  synopsis: string | null
  screenshots: string[]
  busyUrl: string | null
}

export function favoriteToCatalogGame(entry: FavoriteCatalogEntry): CatalogGame {
  const catalogKey = favoriteCatalogKeyForEntry(entry.title, entry.catalogKey)
  return {
    id: catalogKey,
    title: entry.title,
    genre: '',
    source: 'favorite',
    groupKey: isUsableFavoriteCatalogKey(catalogKey) ? catalogKey : null,
  }
}

export function sameFavoriteGame(entry: FavoriteCatalogEntry, game: CatalogGame): boolean {
  const entryKey = favoriteCatalogKeyForEntry(entry.title, entry.catalogKey)
  const gameKey = favoriteCatalogKeyForGame(game)
  return entryKey === gameKey ||
    entry.title.trim().toLowerCase() === game.title.trim().toLowerCase()
}
