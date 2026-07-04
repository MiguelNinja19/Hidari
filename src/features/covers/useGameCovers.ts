import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame, DownloadJob, GameCover } from '../../shared/types/contracts'
import { cleanTitleForCover, normalizeTitleKey } from '../../shared/utils/normalizeTitleKey'

export type CoverStatus = 'idle' | 'loading' | 'cached' | 'error'

export type ResolvedCover = {
  coverUrl: string | null
  localPath: string | null
  status: CoverStatus
}

const WARM_RETRY_MS = 30 * 60 * 1000
const MAX_WARM_CONCURRENT = 4

type WarmTask = { title: string; coverUrl: string; key: string }

function findSavedCover(
  title: string,
  savedCovers: Record<string, GameCover>,
): GameCover | null {
  return savedCovers[normalizeTitleKey(title)] ?? null
}

function findCatalogCoverUrl(
  title: string,
  coverByTitleKey: Map<string, string>,
): string | null {
  return coverByTitleKey.get(normalizeTitleKey(title)) ?? null
}

type WarmQueueContext = {
  warmQueueRef: RefObject<WarmTask[]>
  warmInFlightRef: MutableRefObject<number>
  refresh: () => void
}

function drainCoverWarmQueue(ctx: WarmQueueContext) {
  while (ctx.warmInFlightRef.current < MAX_WARM_CONCURRENT && ctx.warmQueueRef.current.length > 0) {
    const task = ctx.warmQueueRef.current.shift()
    if (!task) break

    ctx.warmInFlightRef.current += 1
    void (async () => {
      try {
        await sourcesApi.saveGameCover(task.title, task.coverUrl)
        await sourcesApi.ensureGameCoverCached(task.title)
        ctx.refresh()
      } catch {
        // Mantém timestamp para respeitar WARM_RETRY_MS antes de nova tentativa.
      } finally {
        ctx.warmInFlightRef.current -= 1
        drainCoverWarmQueue(ctx)
      }
    })()
  }
}

export function useGameCovers(catalogGames: CatalogGame[]) {
  const [savedCovers, setSavedCovers] = useState<Record<string, GameCover>>({})
  const savedCoversRef = useRef(savedCovers)
  const warmQueueRef = useRef<WarmTask[]>([])
  const warmInFlightRef = useRef(0)
  const warmAttemptAtRef = useRef(new Map<string, number>())
  const lookupAttemptedRef = useRef(new Set<string>())

  useEffect(() => {
    savedCoversRef.current = savedCovers
  }, [savedCovers])

  const coverByTitleKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const game of catalogGames) {
      if (!game.coverUrl) continue
      map.set(normalizeTitleKey(game.title), game.coverUrl)
    }
    return map
  }, [catalogGames])

  const refreshTimerRef = useRef<number | null>(null)

  const refreshCovers = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void sourcesApi.listGameCovers().then((rows) => {
        setSavedCovers((prev) => {
          const map = { ...prev }
          for (const row of rows) {
            map[row.titleKey] = row
          }
          return map
        })
      })
    }, 350)
  }, [])

  const refreshCoversRef = useRef(refreshCovers)
  useEffect(() => {
    refreshCoversRef.current = refreshCovers
  }, [refreshCovers])

  useEffect(() => {
    refreshCovers()
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [refreshCovers])

  const resolveCover = useCallback(
    (title: string, catalogCoverUrl?: string | null): ResolvedCover => {
      const saved = findSavedCover(title, savedCovers)
      const explicitUrl = catalogCoverUrl?.trim() || null
      const coverUrl =
        explicitUrl ?? saved?.coverUrl ?? findCatalogCoverUrl(title, coverByTitleKey)
      const localPath =
        saved && (explicitUrl == null || saved.coverUrl === explicitUrl)
          ? saved.localPath ?? null
          : null
      if (localPath) {
        return { coverUrl, localPath, status: 'cached' }
      }
      if (coverUrl) {
        return { coverUrl, localPath: null, status: 'idle' }
      }
      return { coverUrl: null, localPath: null, status: 'error' }
    },
    [savedCovers, coverByTitleKey],
  )

  const enqueueWarm = useCallback((title: string, coverUrl: string) => {
    const trimmed = coverUrl.trim()
    if (!trimmed) return

    const key = normalizeTitleKey(title)
    const saved = findSavedCover(title, savedCoversRef.current)
    if (saved?.localPath) return

    const lastAttempt = warmAttemptAtRef.current.get(key) ?? 0
    if (Date.now() - lastAttempt < WARM_RETRY_MS && lastAttempt > 0) {
      return
    }

    if (warmQueueRef.current.some((task) => task.key === key)) return

    warmAttemptAtRef.current.set(key, Date.now())
    warmQueueRef.current.push({ title, coverUrl: trimmed, key })
    drainCoverWarmQueue({
      warmQueueRef,
      warmInFlightRef,
      refresh: () => refreshCoversRef.current(),
    })
  }, [])

  const warmCover = useCallback(
    (title: string, coverUrl: string) => {
      enqueueWarm(title, coverUrl)
    },
    [enqueueWarm],
  )

  const warmCovers = useCallback(
    (items: Array<{ title: string; coverUrl: string }>) => {
      for (const item of items) {
        enqueueWarm(item.title, item.coverUrl)
      }
    },
    [enqueueWarm],
  )

  const syncJobCovers = useCallback(
    (jobs: DownloadJob[]) => {
      const pending = jobs
        .map((job) => {
          if (findSavedCover(job.title, savedCovers)) return null
          const coverUrl = findCatalogCoverUrl(job.title, coverByTitleKey)
          if (!coverUrl) return null
          return { title: job.title, coverUrl }
        })
        .filter((item): item is { title: string; coverUrl: string } => item != null)

      if (pending.length === 0) return
      warmCovers(pending)
    },
    [coverByTitleKey, savedCovers, warmCovers],
  )

  const lookupCoverForTitle = useCallback(
    (title: string) => {
      const resolved = resolveCover(title)
      if (resolved.coverUrl) {
        warmCover(title, resolved.coverUrl)
        return
      }

      const key = normalizeTitleKey(title)
      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)

      void sourcesApi.resolveGameCoverUrl(title).then((url) => {
        if (url?.trim()) {
          warmCover(title, url.trim())
        }
      })
    },
    [resolveCover, warmCover],
  )

  const lookupMissingLibraryCover = useCallback(
    (title: string) => {
      const resolved = resolveCover(title)
      if (resolved.coverUrl) return

      const key = normalizeTitleKey(title)
      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)

      const query = cleanTitleForCover(title)
      if (query.length < 3) return

      void sourcesApi.searchGameCatalog({ query, includeSteam: true }).then((rows) => {
        const hit = rows.find((row) => row.coverUrl) ?? rows[0]
        if (hit?.coverUrl) {
          warmCover(title, hit.coverUrl)
        }
      })
    },
    [resolveCover, warmCover],
  )

  const invalidateLocalCover = useCallback(
    (title: string, coverUrl?: string | null) => {
      const key = normalizeTitleKey(title)
      warmAttemptAtRef.current.delete(key)
      void sourcesApi.invalidateGameCoverLocal(title).then(() => {
        refreshCoversRef.current()
        const url = coverUrl?.trim()
        if (url) {
          warmCover(title, url)
        }
      })
    },
    [warmCover],
  )

  return {
    savedCovers,
    resolveCover,
    warmCover,
    warmCovers,
    refreshCovers,
    syncJobCovers,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  }
}
