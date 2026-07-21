import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import type { AppSettingsContextValue } from './appSettingsTypes'
import { useAppSettingsState } from './useAppSettingsState'

export type { AppSettingsContextValue } from './appSettingsTypes'

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const value = useAppSettingsState()

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}
