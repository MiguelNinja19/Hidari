import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { FavoriteEntry } from '../../shared/types/contracts'

type FavoritesContextValue = {
  favorites: FavoriteEntry[]
  error: string
  refresh: () => Promise<void>
  isFavorite: (catalogKey: string) => boolean
  toggleFavorite: (catalogKey: string, title: string) => Promise<boolean>
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

function useFavoritesState(): FavoritesContextValue {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const rows = await sourcesApi.listFavorites()
      setFavorites(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar favoritos.')
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
    error,
    refresh,
    isFavorite,
    toggleFavorite,
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const value = useFavoritesState()
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider')
  }
  return ctx
}
