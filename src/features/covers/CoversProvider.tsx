import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { CatalogGame, DownloadJob } from '../../shared/types/contracts'
import { useGameCovers } from './useGameCovers'

type CoversContextValue = ReturnType<typeof useGameCovers>

const CoversContext = createContext<CoversContextValue | null>(null)

type CoversProviderProps = {
  catalogGames: CatalogGame[]
  jobs?: DownloadJob[]
  /** Carrega capas em cache de imediato (favoritos, biblioteca, downloads). */
  eager?: boolean
  /** Títulos para resolver em batch logo ao montar. */
  preloadTitles?: string[]
  children: ReactNode
}

export function CoversProvider({
  catalogGames,
  jobs = [],
  eager = false,
  preloadTitles = [],
  children,
}: CoversProviderProps) {
  const covers = useGameCovers(catalogGames, { eager })
  const syncJobCoversRef = useRef(covers.syncJobCovers)
  const resolveCoversBatchRef = useRef(covers.resolveCoversBatch)
  syncJobCoversRef.current = covers.syncJobCovers
  resolveCoversBatchRef.current = covers.resolveCoversBatch

  const jobsKey = jobs.map((job) => job.id).join('|')
  const preloadKey = preloadTitles.join('\0')

  useEffect(() => {
    if (jobs.length === 0) return
    syncJobCoversRef.current(jobs)
  }, [jobs, jobsKey])

  useEffect(() => {
    if (preloadTitles.length === 0) return
    resolveCoversBatchRef.current(preloadTitles)
  }, [preloadKey, preloadTitles])

  return <CoversContext.Provider value={covers}>{children}</CoversContext.Provider>
}

export function useCovers(): CoversContextValue {
  const ctx = useContext(CoversContext)
  if (!ctx) {
    throw new Error('useCovers must be used within CoversProvider')
  }
  return ctx
}
