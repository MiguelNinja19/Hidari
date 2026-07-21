import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import {
  favoriteCatalogKeyForGame,
} from '../../shared/utils/favoriteCatalogKey'
import type { CatalogGame } from '../../shared/types/contracts'
import { buildFavoriteIndex, gameIsFavorite } from './favoriteCatalogIndex'
import type { FavoriteCatalogApi, UseFavoriteCatalogOptions } from './favoriteCatalogTypes'

export type { FavoriteCatalogApi, UseFavoriteCatalogOptions } from './favoriteCatalogTypes'

function resolveOnError(
  arg?: ((message: string) => void) | UseFavoriteCatalogOptions,
): ((message: string) => void) | undefined {
  if (typeof arg === 'function') return arg
  return arg?.onError
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
      return gameIsFavorite(game, keys, titles)
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
        // Re-read DB so legacy/duplicate rows cannot leave a stale index.
        const entries = await sourcesApi.listFavoriteCatalogEntries()
        const index = buildFavoriteIndex(entries)
        setKeys(index.keys)
        setTitles(index.titles)
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
