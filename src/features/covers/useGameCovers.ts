import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame, CoverPrecacheStatus, DownloadJob, GameCover } from '../../shared/types/contracts'
import { coverTitleKey, coverTitleKeyCandidates, coverStorageKeyAliases, normalizeTitleKey } from '../../shared/utils/normalizeTitleKey'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'

export type CoverStatus = 'idle' | 'loading' | 'cached' | 'error'

export type ResolvedCover = {
  coverUrl: string | null
  localPath: string | null
  status: CoverStatus
}

const WARM_RETRY_MS = 30 * 60 * 1000
const BATCH_LOOKUP_RETRY_MS = 15 * 60 * 1000
const BATCH_DEBOUNCE_MS = 40
const MAX_WARM_CONCURRENT = 4
const INVALIDATE_COOLDOWN_MS = 10 * 60 * 1000

type WarmTask = { title: string; coverUrl: string; key: string }

function isSteamLibraryCoverUrl(url: string): boolean {
  return /steamstatic|steamcdn|cdn\.akamai\.steamstatic|steamcommunity|library_600x900/i.test(
    url,
  )
}

function findSavedCover(
  title: string,
  savedCovers: Record<string, GameCover>,
): GameCover | null {
  const matches: GameCover[] = []
  const seen = new Set<string>()
  for (const key of coverTitleKeyCandidates(title)) {
    const row = savedCovers[key]
    if (!row || seen.has(row.titleKey)) continue
    seen.add(row.titleKey)
    matches.push(row)
  }
  if (matches.length === 0) return null
  const catalog = matches.find((row) => !isSteamLibraryCoverUrl(row.coverUrl))
  return catalog ?? matches[0] ?? null
}

function indexSavedCoverRows(
  map: Record<string, GameCover>,
  rows: GameCover[],
): Record<string, GameCover> {
  for (const row of rows) {
    for (const key of coverStorageKeyAliases(row.titleKey)) {
      const existing = map[key]
      if (
        existing &&
        !isSteamLibraryCoverUrl(existing.coverUrl) &&
        isSteamLibraryCoverUrl(row.coverUrl)
      ) {
        continue
      }
      map[key] = row
    }
  }
  return map
}

function findCatalogCover(
  title: string,
  coverByTitleKey: Map<string, { coverUrl: string; localPath?: string | null }>,
): { coverUrl: string; localPath?: string | null } | null {
  for (const key of coverTitleKeyCandidates(title)) {
    const row = coverByTitleKey.get(key)
    if (row) return row
  }
  return null
}

function isCoverLookupPending(title: string, loadingKeys: Set<string>): boolean {
  return coverTitleKeyCandidates(title).some((key) => loadingKeys.has(key))
}

function markCoverLookupPending(title: string, loadingKeys: Set<string>) {
  for (const key of coverTitleKeyCandidates(title)) {
    loadingKeys.add(key)
  }
}

function clearCoverLookupPending(title: string, loadingKeys: Set<string>) {
  for (const key of coverTitleKeyCandidates(title)) {
    loadingKeys.delete(key)
  }
}

type WarmQueueContext = {
  warmQueueRef: RefObject<WarmTask[]>
  warmInFlightRef: MutableRefObject<number>
  refresh: () => void
}

function drainCoverWarmQueue(
  ctx: WarmQueueContext,
  onPatched?: (row: GameCover) => void,
) {
  while (ctx.warmInFlightRef.current < MAX_WARM_CONCURRENT && ctx.warmQueueRef.current.length > 0) {
    const task = ctx.warmQueueRef.current.shift()
    if (!task) break

    ctx.warmInFlightRef.current += 1
    void sourcesApi.saveGameCover(task.title, task.coverUrl).finally(() => {
      ctx.warmInFlightRef.current -= 1
      drainCoverWarmQueue(ctx, onPatched)
    })
  }
}

export function useGameCovers(catalogGames: CatalogGame[], options?: { eager?: boolean }) {
  const [savedCovers, setSavedCovers] = useState<Record<string, GameCover>>({})
  const savedCoversRef = useRef(savedCovers)
  const warmQueueRef = useRef<WarmTask[]>([])
  const warmInFlightRef = useRef(0)
  const warmAttemptAtRef = useRef(new Map<string, number>())
  const batchLookupAttemptAtRef = useRef(new Map<string, number>())
  const lookupAttemptedRef = useRef(new Set<string>())
  const loadingKeysRef = useRef(new Set<string>())
  const batchInFlightRef = useRef(false)
  const batchTimerRef = useRef<number | null>(null)
  const pendingBatchTitlesRef = useRef<string[]>([])
  const invalidateAttemptAtRef = useRef(new Map<string, number>())
  const [loadingVersion, setLoadingVersion] = useState(0)

  useEffect(() => {
    savedCoversRef.current = savedCovers
  }, [savedCovers])

  const coverByTitleKey = useMemo(() => {
    const map = new Map<string, { coverUrl: string; localPath?: string | null }>()
    for (const game of catalogGames) {
      const coverUrl = game.coverUrl?.trim()
      const localPath = game.localCoverPath?.trim()
      if (!coverUrl && !localPath) continue
      map.set(coverTitleKey(game.title), {
        coverUrl: coverUrl ?? '',
        localPath: localPath ?? null,
      })
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
        setSavedCovers((prev) => indexSavedCoverRows({ ...prev }, rows))
      })
    }, 350)
  }, [])

  const refreshCoversRef = useRef(refreshCovers)
  useEffect(() => {
    refreshCoversRef.current = refreshCovers
  }, [refreshCovers])

  useEffect(() => {
    const loadSavedCovers = () => {
      void sourcesApi.listGameCovers().then((rows) => {
        setSavedCovers((prev) => indexSavedCoverRows({ ...prev }, rows))
      })
    }

    if (options?.eager) {
      loadSavedCovers()
      return
    }

    const cancel = scheduleDeferred(loadSavedCovers, 0)
    return cancel
  }, [options?.eager])

  useEffect(() => {
    let cancelled = false
    void listen<CoverPrecacheStatus>('cover-precache-progress', (event) => {
      if (cancelled || event.payload.running) return
      refreshCoversRef.current()
    }).then((unlisten) => () => {
      cancelled = true
      void unlisten()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const resolveCover = useCallback(
    (
      title: string,
      catalogCoverUrl?: string | null,
      catalogLocalPath?: string | null,
    ): ResolvedCover => {
      const saved = findSavedCover(title, savedCovers)
      const catalog = findCatalogCover(title, coverByTitleKey)
      const explicitUrl = catalogCoverUrl?.trim() || null
      const coverUrl =
        explicitUrl || saved?.coverUrl || catalog?.coverUrl || null
      const localPath =
        catalogLocalPath?.trim() ||
        catalog?.localPath?.trim() ||
        (saved && (explicitUrl == null || saved.coverUrl === explicitUrl)
          ? saved.localPath ?? null
          : null) ||
        null

      if (localPath) {
        return { coverUrl, localPath, status: 'cached' }
      }
      if (coverUrl) {
        return { coverUrl, localPath: null, status: 'idle' }
      }
      if (loadingKeysRef.current.has(normalizeTitleKey(title)) || isCoverLookupPending(title, loadingKeysRef.current)) {
        return { coverUrl: null, localPath: null, status: 'loading' }
      }
      return { coverUrl: null, localPath: null, status: 'idle' }
    },
    [savedCovers, coverByTitleKey, loadingVersion],
  )

  const resolveCoverRef = useRef(resolveCover)
  useEffect(() => {
    resolveCoverRef.current = resolveCover
  }, [resolveCover])

  const patchSavedCover = useCallback((row: GameCover) => {
    setSavedCovers((prev) => indexSavedCoverRows({ ...prev }, [row]))
  }, [])

  const patchSavedCoverRef = useRef(patchSavedCover)
  useEffect(() => {
    patchSavedCoverRef.current = patchSavedCover
  }, [patchSavedCover])

  const enqueueWarm = useCallback((title: string, coverUrl: string) => {
    const trimmed = coverUrl.trim()
    if (!trimmed) return

    const key = coverTitleKey(title)
    const saved = findSavedCover(title, savedCoversRef.current)
    if (saved?.localPath) return

    const lastAttempt = warmAttemptAtRef.current.get(key) ?? 0
    if (Date.now() - lastAttempt < WARM_RETRY_MS && lastAttempt > 0) {
      return
    }

    if (warmQueueRef.current.some((task) => task.key === key)) return

    warmAttemptAtRef.current.set(key, Date.now())
    warmQueueRef.current.push({ title, coverUrl: trimmed, key })
    drainCoverWarmQueue(
      {
        warmQueueRef,
        warmInFlightRef,
        refresh: () => refreshCoversRef.current(),
      },
      (row) => patchSavedCoverRef.current(row),
    )
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
          if (findSavedCover(job.title, savedCoversRef.current)) return null
          const coverUrl = findCatalogCover(job.title, coverByTitleKey)?.coverUrl
          if (!coverUrl) return null
          return { title: job.title, coverUrl }
        })
        .filter((item): item is { title: string; coverUrl: string } => item != null)

      if (pending.length === 0) return
      warmCovers(pending)
    },
    [coverByTitleKey, warmCovers],
  )

  const flushResolveCoversBatch = useCallback((titles: string[]) => {
    const missing = titles.filter((title) => {
      if (isCoverLookupPending(title, loadingKeysRef.current)) return false
      const resolved = resolveCoverRef.current(title)
      if (resolved.coverUrl || resolved.localPath) return false

      const key = coverTitleKey(title)
      const lastBatchAttempt = batchLookupAttemptAtRef.current.get(key) ?? 0
      if (lastBatchAttempt > 0 && Date.now() - lastBatchAttempt < BATCH_LOOKUP_RETRY_MS) {
        return false
      }
      return true
    })
    if (missing.length === 0) return

    if (batchTimerRef.current != null) {
      window.clearTimeout(batchTimerRef.current)
    }

    batchTimerRef.current = window.setTimeout(() => {
      batchTimerRef.current = null

      const pending = missing.filter(
        (title) => !isCoverLookupPending(title, loadingKeysRef.current),
      )
      if (pending.length === 0) return

      if (batchInFlightRef.current) {
        pendingBatchTitlesRef.current.push(...pending)
        return
      }

      for (const title of pending) {
        markCoverLookupPending(title, loadingKeysRef.current)
        batchLookupAttemptAtRef.current.set(coverTitleKey(title), Date.now())
      }
      setLoadingVersion((value) => value + 1)
      batchInFlightRef.current = true

      void sourcesApi
        .resolveCoversForTitles(pending)
        .then((rows) => {
          for (const row of rows) {
            const url = row.coverUrl?.trim()
            if (!url) continue
            if (!row.localCoverPath?.trim()) {
              enqueueWarm(row.title, url)
            }
          }
          setSavedCovers((prev) => {
            const map = { ...prev }
            const patched: GameCover[] = []
            for (const row of rows) {
              clearCoverLookupPending(row.title, loadingKeysRef.current)
              if (!row.coverUrl?.trim()) continue
              const key = coverTitleKey(row.title)
              patched.push({
                titleKey: key,
                coverUrl: row.coverUrl,
                localPath: row.localCoverPath ?? null,
              })
            }
            return indexSavedCoverRows(map, patched)
          })
        })
        .catch(() => {
          for (const title of pending) {
            clearCoverLookupPending(title, loadingKeysRef.current)
          }
        })
        .finally(() => {
          batchInFlightRef.current = false
          setLoadingVersion((value) => value + 1)
          const queued = pendingBatchTitlesRef.current
          pendingBatchTitlesRef.current = []
          if (queued.length > 0) {
            flushResolveCoversBatch(queued)
          }
        })
    }, BATCH_DEBOUNCE_MS)
  }, [enqueueWarm])

  const resolveCoversBatch = useCallback(
    (titles: string[]) => {
      flushResolveCoversBatch(titles)
    },
    [flushResolveCoversBatch],
  )

  const lookupCoverForTitle = useCallback(
    (title: string) => {
      const key = coverTitleKey(title)
      if (loadingKeysRef.current.has(key)) return

      const resolved = resolveCoverRef.current(title)
      if (resolved.localPath || resolved.status === 'cached') {
        return
      }
      if (resolved.coverUrl) {
        warmCover(title, resolved.coverUrl)
        return
      }

      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)
      loadingKeysRef.current.add(key)

      void sourcesApi
        .resolveGameCoverUrl(title)
        .then((url) => {
          if (url?.trim()) {
            setSavedCovers((prev) => ({
              ...prev,
              [key]: {
                titleKey: key,
                coverUrl: url.trim(),
                localPath: prev[key]?.localPath ?? null,
              },
            }))
          }
        })
        .finally(() => {
          loadingKeysRef.current.delete(key)
          setLoadingVersion((value) => value + 1)
        })
    },
    [warmCover],
  )

  const lookupMissingLibraryCover = useCallback(
    (title: string) => {
      const resolved = resolveCoverRef.current(title)
      if (resolved.coverUrl || resolved.localPath) return

      const key = coverTitleKey(title)
      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)

      resolveCoversBatch([title])
    },
    [resolveCoversBatch],
  )

  const invalidateLocalCover = useCallback((title: string, _coverUrl?: string | null) => {
    const key = coverTitleKey(title)
    const last = invalidateAttemptAtRef.current.get(key) ?? 0
    if (Date.now() - last < INVALIDATE_COOLDOWN_MS) return
    invalidateAttemptAtRef.current.set(key, Date.now())

    void sourcesApi.invalidateGameCoverLocal(title).then(() => {
      refreshCoversRef.current()
      // Não re-aquece já — o remoto continua a servir a UI; warm só no scroll/batch natural.
    })
  }, [])

  return {
    savedCovers,
    resolveCover,
    warmCover,
    warmCovers,
    refreshCovers,
    syncJobCovers,
    resolveCoversBatch,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  }
}
