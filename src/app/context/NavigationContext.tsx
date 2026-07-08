import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { NavTab } from '../../layout/types'

export type NavigationContextValue = {
  activeTab: NavTab
  setActiveTab: Dispatch<SetStateAction<NavTab>>
  navigateDiscover: () => void
  navigateFavorites: () => void
  navigateDownloads: () => void
  navigateLibrary: () => void
  navigateSettings: () => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavTab>('discover')

  const navigateDiscover = useCallback(() => setActiveTab('discover'), [])
  const navigateFavorites = useCallback(() => setActiveTab('favorites'), [])
  const navigateDownloads = useCallback(() => setActiveTab('downloads'), [])
  const navigateLibrary = useCallback(() => setActiveTab('library'), [])
  const navigateSettings = useCallback(() => setActiveTab('settings'), [])

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      navigateDiscover,
      navigateFavorites,
      navigateDownloads,
      navigateLibrary,
      navigateSettings,
    }),
    [activeTab, navigateDiscover, navigateFavorites, navigateDownloads, navigateLibrary, navigateSettings],
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return ctx
}
