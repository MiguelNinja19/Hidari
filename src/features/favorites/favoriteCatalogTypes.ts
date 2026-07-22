import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'

export type UseFavoriteCatalogOptions = {
  onError?: (message: string) => void
}

export type FavoriteCatalogApi = {
  loading: boolean
  entries: FavoriteCatalogEntry[]
  refresh: () => Promise<void>
  isFavorite: (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => boolean
  isBusy: (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => boolean
  toggleFavorite: (
    game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>,
  ) => Promise<boolean | null>
}
