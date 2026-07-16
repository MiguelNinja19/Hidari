import { createContext, useContext, type ReactNode } from 'react'
import { useToast } from '../../shared/components/ToastProvider'
import {
  useFavoriteCatalogState,
  type FavoriteCatalogApi,
  type UseFavoriteCatalogOptions,
} from './useFavoriteCatalog'

const FavoriteCatalogContext = createContext<FavoriteCatalogApi | null>(null)

type FavoriteCatalogProviderProps = {
  children: ReactNode
  onError?: UseFavoriteCatalogOptions['onError']
}

export function FavoriteCatalogProvider({ children, onError }: FavoriteCatalogProviderProps) {
  const { showError } = useToast()
  const value = useFavoriteCatalogState({
    onError: onError ?? ((message) => showError(message)),
  })
  return (
    <FavoriteCatalogContext.Provider value={value}>{children}</FavoriteCatalogContext.Provider>
  )
}

/** API partilhada de favoritos (uma só instância na app). */
export function useFavoriteCatalog(): FavoriteCatalogApi {
  const ctx = useContext(FavoriteCatalogContext)
  if (!ctx) {
    throw new Error('useFavoriteCatalog must be used within FavoriteCatalogProvider')
  }
  return ctx
}
