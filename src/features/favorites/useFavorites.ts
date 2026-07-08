import { useCallback, useEffect, useMemo, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { FavoriteEntry } from '../../shared/types/contracts'

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const rows = await sourcesApi.listFavorites()
      setFavorites(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar favoritos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((entry) => entry.catalogKey)),
    [favorites],
  )

  const isFavorite = useCallback(
    (catalogKey: string) => favoriteKeys.has(catalogKey),
    [favoriteKeys],
  )

  const toggleFavorite = useCallback(
    async (catalogKey: string, title: string) => {
      setError('')
      const added = await sourcesApi.toggleFavorite({ catalogKey, title })
      await refresh()
      return added
    },
    [refresh],
  )

  return {
    favorites,
    loading,
    error,
    refresh,
    isFavorite,
    toggleFavorite,
  }
}
