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

  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const jobsKey = jobs.map((job) => job.id).join('|')
  const preloadKey = preloadTitles.join('\0')

  useEffect(() => {
    if (!jobsKey) return
    // Só quando entram/saem jobs — não a cada tick de progresso.
    syncJobCoversRef.current(jobsRef.current)
  }, [jobsKey])

  useEffect(() => {
    if (!preloadKey) return
    resolveCoversBatchRef.current(preloadTitles)
    // preloadTitles identity muda; preloadKey é a chave estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadKey])

  return <CoversContext.Provider value={covers}>{children}</CoversContext.Provider>
}

export function useCovers(): CoversContextValue {
  const ctx = useContext(CoversContext)
  if (!ctx) {
    throw new Error('useCovers must be used within CoversProvider')
  }
  return ctx
}
