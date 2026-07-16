import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import {
  favoriteCatalogKeyForEntry,
  favoriteCatalogKeyForGame,
} from '../../shared/utils/favoriteCatalogKey'
import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

function buildFavoriteIndex(entries: FavoriteCatalogEntry[]) {
  const keys = new Set<string>()
  const titles = new Set<string>()
  for (const entry of entries) {
    keys.add(favoriteCatalogKeyForEntry(entry.title, entry.catalogKey))
    const title = normalizeTitle(entry.title)
    if (title) titles.add(title)
  }
  return { keys, titles }
}

export type UseFavoriteCatalogOptions = {
  onError?: (message: string) => void
}

function resolveOnError(
  arg?: ((message: string) => void) | UseFavoriteCatalogOptions,
): ((message: string) => void) | undefined {
  if (typeof arg === 'function') return arg
  return arg?.onError
}

export type FavoriteCatalogApi = {
  loading: boolean
  refresh: () => Promise<void>
  isFavorite: (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => boolean
  isBusy: (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => boolean
  toggleFavorite: (
    game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>,
  ) => Promise<boolean | null>
}

/** Estado interno — usar via FavoriteCatalogProvider. */
export function useFavoriteCatalogState(
  onErrorOrOptions?: ((message: string) => void) | UseFavoriteCatalogOptions,
): FavoriteCatalogApi {
  const onError = resolveOnError(onErrorOrOptions)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const [keys, setKeys] = useState<Set<string>>(() => new Set())
  const [titles, setTitles] = useState<Set<string>>(() => new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await sourcesApi.listFavoriteCatalogEntries()
      const index = buildFavoriteIndex(entries)
      setKeys(index.keys)
      setTitles(index.titles)
    } catch (error) {
      setKeys(new Set())
      setTitles(new Set())
      onErrorRef.current?.(formatUserError(error, 'Could not load favorites.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isFavorite = useCallback(
    (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => {
      const key = favoriteCatalogKeyForGame(game)
      if (keys.has(key)) return true
      const title = normalizeTitle(game.title)
      return title.length > 0 && titles.has(title)
    },
    [keys, titles],
  )

  const isBusy = useCallback(
    (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) =>
      busyKey === favoriteCatalogKeyForGame(game),
    [busyKey],
  )

  const toggleFavorite = useCallback(
    async (game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>) => {
      const key = favoriteCatalogKeyForGame(game)
      if (busyKey === key) return null
      setBusyKey(key)
      try {
        const next = await sourcesApi.toggleFavoriteCatalogEntry(game.title, key)
        setKeys((prev) => {
          const updated = new Set(prev)
          if (next) updated.add(key)
          else updated.delete(key)
          return updated
        })
        setTitles((prev) => {
          const updated = new Set(prev)
          const title = normalizeTitle(game.title)
          if (!title) return updated
          if (next) updated.add(title)
          else updated.delete(title)
          return updated
        })
        return next
      } catch (error) {
        onErrorRef.current?.(formatUserError(error, 'Could not update favorite.'))
        return null
      } finally {
        setBusyKey(null)
      }
    },
    [busyKey],
  )

  return useMemo(
    () => ({
      loading,
      refresh,
      isFavorite,
      isBusy,
      toggleFavorite,
    }),
    [loading, refresh, isFavorite, isBusy, toggleFavorite],
  )
}
