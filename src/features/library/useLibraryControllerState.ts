import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ask, open } from '@tauri-apps/plugin-dialog'
import type { AppDispatch } from '../../app/store'
import { store } from '../../app/store'
import {
  cancelJob,
  extractStatusReceived,
  fetchJobs,
  removeJobLocally,
} from '../queue/queueSlice'
import { queueApi } from '../../shared/api/tauri/queueApi'
import { tauriClient } from '../../shared/api/tauri/client'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { resolveDeletePath } from '../../shared/utils/archive'
import { jobPathsOverlap } from '../../shared/utils/jobExtraction'
import { dedupeLibraryEntries, findRelatedLibraryJobs, libraryGameKey } from '../../shared/utils/libraryDedupe'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import { formatLaunchError } from '../../shared/utils/launchErrors'
import { formatUserError } from '../../shared/utils/formatUserError'
import {
  INSTALL_WATCH_INTERVAL_MS,
  INSTALL_WATCH_MAX_TICKS,
  LIBRARY_COVER_LOOKUP_DEBOUNCE_MS,
  LIBRARY_INSPECT_BATCH_PAUSE_MS,
  LIBRARY_INSPECT_BATCH_SIZE,
} from '../../shared/config/polling'
import {
  parseLibrarySort,
  SETTING_KEY,
  type LibrarySort,
} from '../../shared/config/appSettings'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'
import type { LibraryControllerValue } from './LibraryController'
import {
  isJobFinished,
  isPlayableLibraryItem,
  jobPathCtx,
  needsInstallItem,
  pathStateKey,
} from './libraryItemState'
import type { LibraryEntry } from './types'
import {
  clearLibraryPathStateCache,
  hydrateLibraryPathStateCache,
  mergeLibraryPathStateCache,
  removeLibraryPathStateCacheKeys,
  setLibraryPathStateCacheEntry,
} from './libraryPathStateCache'

const emptyPathState = (): LibraryControllerValue['pathStateByKey'][string] => ({
  playable: false,
  hasGame: false,
  needsInstall: false,
  needsExtraction: false,
  installPath: null,
})

const normalizeDownloadPath = (path: string) => path.trim().replace(/\\/g, '/').toLowerCase()

const scoreLibraryEntry = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: LibraryControllerValue['pathStateByKey'],
): number => {
  if (isPlayableLibraryItem(item, jobs, pathStateByKey)) return 100
  if (
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting', 'paused'].includes(item.status)
  ) {
    return 80
  }
  if (needsInstallItem(item, pathStateByKey)) return 60
  if (item.kind === 'folder') return 40
  return 20
}

const sortLibraryEntries = (items: LibraryEntry[], sort: LibrarySort): LibraryEntry[] => {
  const sorted = [...items]
  if (sort === 'title-desc') {
    sorted.sort((a, b) => b.title.localeCompare(a.title, 'pt', { sensitivity: 'base' }))
  } else {
    sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }))
  }
  return sorted
}

type UseLibraryControllerStateArgs = {
  activeTab: NavTab
  jobs: DownloadJob[]
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
  resolveCover: LibraryControllerValue['resolveCover']
  resolveCoversBatch: (titles: string[]) => void
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function useLibraryControllerState({
  activeTab,
  jobs,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
  resolveCover,
  resolveCoversBatch,
  invalidateLocalCover,
}: UseLibraryControllerStateArgs): LibraryControllerValue {
  const [libraryFilter, setLibraryFilter] = useState('')
  const [librarySort, setLibrarySortState] = useState<LibrarySort>('title-asc')
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [pathStateByKey, setPathStateByKey] = useState<LibraryControllerValue['pathStateByKey']>({})
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [savePathError, setSavePathError] = useState('')
  const [playBusyId, setPlayBusyId] = useState<string | null>(null)
  const [installBusyId, setInstallBusyId] = useState<string | null>(null)
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(() => new Set())

  const installWatchRef = useRef<Map<string, number>>(new Map())
  const pathStateByKeyRef = useRef(pathStateByKey)
  const jobsRef = useRef(jobs)
  const defaultDownloadPathRef = useRef(defaultDownloadPath)
  const knownDownloadPathRef = useRef('')
  const jobStatusRef = useRef<Map<string, string>>(new Map())
  const libraryCoverLookupAttemptedRef = useRef(new Set<string>())

  useEffect(() => {
    pathStateByKeyRef.current = pathStateByKey
  }, [pathStateByKey])

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    defaultDownloadPathRef.current = defaultDownloadPath
  }, [defaultDownloadPath])

  const runBatchPathInspection = useCallback(
    async (
      folderItems: LocalLibraryItem[],
      jobList: DownloadJob[],
      options?: { onlyUnresolved?: boolean; isCancelled?: () => boolean },
    ) => {
      const onlyUnresolved = options?.onlyUnresolved === true
      const isCancelled = options?.isCancelled ?? (() => false)
      const downloadPath = defaultDownloadPathRef.current
      const candidates = new Map<string, { title: string; path: string; jobId?: string }>()

      for (const job of jobList) {
        const pathKey = pathStateKey(job.destPath, jobPathCtx(job))
        if (!job.destPath.trim()) continue
        if (onlyUnresolved && pathStateByKeyRef.current[pathKey] !== undefined) continue
        candidates.set(pathKey, { title: job.title, path: job.destPath, jobId: job.id })
      }

      for (const item of folderItems) {
        if (!item.isDir) continue
        const pathKey = pathStateKey(item.path, { title: item.name })
        if (candidates.has(pathKey)) continue
        if (onlyUnresolved && pathStateByKeyRef.current[pathKey] !== undefined) continue
        candidates.set(pathKey, { title: item.name, path: item.path })
      }

      if (candidates.size === 0 || isCancelled()) return

      const entries = [...candidates.entries()].map(([pathKey, entry]) => ({
        key: pathKey,
        title: entry.title,
        path: entry.path,
        jobId: entry.jobId,
      }))

      const merged: LibraryControllerValue['pathStateByKey'] = {}

      for (let index = 0; index < entries.length; index += LIBRARY_INSPECT_BATCH_SIZE) {
        if (isCancelled()) return
        if (index > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, LIBRARY_INSPECT_BATCH_PAUSE_MS)
          })
        }
        const chunk = entries.slice(index, index + LIBRARY_INSPECT_BATCH_SIZE)
        try {
          const results = await sourcesApi.inspectLibraryPaths(chunk)
          for (const item of results) {
            merged[item.key] = item.state
          }
        } catch {
          for (const item of chunk) {
            merged[item.key] = emptyPathState()
          }
        }
      }

      if (!isCancelled()) {
        mergeLibraryPathStateCache(merged, downloadPath)
        setPathStateByKey((prev) => ({ ...prev, ...merged }))
      }
    },
    [],
  )

  const inspectAllLibraryPaths = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true
    if (!defaultDownloadPathRef.current.trim()) return
    if (!background) setLibraryLoading(true)
    try {
      const items = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(items)
      if (!background) setSavePathError('')
      await runBatchPathInspection(items, jobsRef.current)
    } catch (error) {
      if (!background) {
        setSavePathError(formatUserError(error, 'Falha ao verificar a pasta de downloads.'))
      }
    } finally {
      if (!background) setLibraryLoading(false)
    }
  }, [runBatchPathInspection])

  useEffect(() => {
    const path = defaultDownloadPath.trim()
    if (!path) return

    const normalized = normalizeDownloadPath(path)
    const previous = knownDownloadPathRef.current

    if (!previous) {
      const persisted = hydrateLibraryPathStateCache(path)
      setPathStateByKey({ ...persisted })
      knownDownloadPathRef.current = normalized
      if (Object.keys(persisted).length === 0) {
        void inspectAllLibraryPaths({ background: true })
      }
      return
    }

    if (previous === normalized) return

    clearLibraryPathStateCache()
    setPathStateByKey({})
    knownDownloadPathRef.current = normalized
    void inspectAllLibraryPaths({ background: true })
  }, [defaultDownloadPath, inspectAllLibraryPaths])

  useEffect(() => {
    if (activeTab !== 'library') return
    void sourcesApi
      .getAppSetting(SETTING_KEY.librarySort)
      .then((value) => {
        setLibrarySortState(parseLibrarySort(value))
      })
      .catch(() => {
        // Tauri indisponível
      })
  }, [activeTab])

  const setLibrarySort = useCallback((value: LibrarySort) => {
    setLibrarySortState(value)
    void sourcesApi.setAppSetting(SETTING_KEY.librarySort, value).catch(() => {
      // ignora falha de persistência
    })
  }, [])

  const refreshPathState = useCallback(async (title: string, path: string, jobId?: string) => {
    const key = pathStateKey(path, { jobId, title })
    const state = await sourcesApi.inspectLibraryPath(title, path, jobId)
    setLibraryPathStateCacheEntry(key, state, defaultDownloadPathRef.current)
    setPathStateByKey((prev) => ({ ...prev, [key]: state }))
    return state
  }, [])

  const watchForInstalledGame = useCallback(
    (title: string, destPath: string, jobId?: string) => {
      const watchKey = pathStateKey(destPath, { jobId, title })
      const existing = installWatchRef.current.get(watchKey)
      if (existing != null) {
        window.clearInterval(existing)
      }
      let ticks = 0
      const intervalId = window.setInterval(() => {
        ticks += 1
        void refreshPathState(title, destPath, jobId).then((state) => {
          if (state.hasGame) {
            window.clearInterval(intervalId)
            installWatchRef.current.delete(watchKey)
          }
        })
        if (ticks >= INSTALL_WATCH_MAX_TICKS && installWatchRef.current.has(watchKey)) {
          window.clearInterval(intervalId)
          installWatchRef.current.delete(watchKey)
        }
      }, INSTALL_WATCH_INTERVAL_MS)
      installWatchRef.current.set(watchKey, intervalId)
    },
    [refreshPathState],
  )

  useEffect(() => {
    const watches = installWatchRef.current
    return () => {
      for (const intervalId of watches.values()) {
        window.clearInterval(intervalId)
      }
      watches.clear()
    }
  }, [])

  useEffect(() => {
    for (const job of jobs) {
      const previousStatus = jobStatusRef.current.get(job.id)
      jobStatusRef.current.set(job.id, job.status)
      if (previousStatus === job.status) continue
      if (!isJobFinished(job)) continue

      const key = pathStateKey(job.destPath, jobPathCtx(job))
      if (pathStateByKeyRef.current[key] !== undefined) continue
      void refreshPathState(job.title, job.destPath, job.id)
    }
  }, [jobs, refreshPathState])

  const refreshLibraryScan = useCallback((options?: { background?: boolean }) => {
    const background = options?.background === true
    if (!background) setLibraryLoading(true)
    return sourcesApi
      .scanDefaultDownloadPath()
      .then((items) => {
        setLocalLibraryItems(items)
        if (!background) setSavePathError('')
      })
      .catch((error) => {
        if (!background) {
          setSavePathError(formatUserError(error, 'Falha ao ler a pasta de downloads.'))
        }
      })
      .finally(() => {
        if (!background) setLibraryLoading(false)
      })
  }, [])

  useEffect(() => {
    if (activeTab !== 'library') return
    refreshLibraryScan({ background: true })
  }, [activeTab, refreshLibraryScan])

  const baseLibraryEntries = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase()

    const jobPaths = new Set(
      jobs.map((job) => resolveDeletePath(job.destPath).toLowerCase()).filter(Boolean),
    )

    const folderEntries: LibraryEntry[] = localLibraryItems
      .filter((item) => item.isDir)
      .filter((item) => {
        const folderPath = item.path.toLowerCase()
        if (jobPaths.has(folderPath)) return false
        const blockedByActiveJob = jobs.some(
          (job) =>
            ['downloading', 'pending', 'retrying', 'extracting', 'paused'].includes(job.status) &&
            jobPathsOverlap(item.path, job.destPath),
        )
        return !blockedByActiveJob
      })
      .map((item) => ({
        id: `folder-${item.path}`,
        title: item.name,
        status: 'installed',
        destPath: item.path,
        kind: 'folder' as const,
      }))

    const jobEntries: LibraryEntry[] = jobs
      .filter((job) => job.status !== 'cancelled')
      .map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        destPath: job.destPath,
        kind: 'job' as const,
        job,
      }))

    const merged = dedupeLibraryEntries([...jobEntries, ...folderEntries], (item) =>
      scoreLibraryEntry(item, jobs, pathStateByKey),
    ).filter((item) => !hiddenLibraryKeys.has(libraryGameKey(item.title)))

    if (!normalizedFilter) return merged
    return merged.filter((item) => item.title.toLowerCase().includes(normalizedFilter))
  }, [jobs, localLibraryItems, libraryFilter, pathStateByKey, hiddenLibraryKeys])

  const filteredEntries = useMemo(
    () => sortLibraryEntries(baseLibraryEntries, librarySort),
    [baseLibraryEntries, librarySort],
  )

  const libraryItems = filteredEntries

  useEffect(() => {
    if (activeTab !== 'library') return
    const missing = libraryItems
      .map((item) => item.title)
      .filter((title) => {
        const resolved = resolveCover(title)
        if (resolved.coverUrl || resolved.localPath) return false
        return !libraryCoverLookupAttemptedRef.current.has(coverTitleKey(title))
      })
    if (missing.length === 0) return
    const timer = window.setTimeout(() => {
      for (const title of missing) {
        libraryCoverLookupAttemptedRef.current.add(coverTitleKey(title))
      }
      resolveCoversBatch(missing)
    }, LIBRARY_COVER_LOOKUP_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [activeTab, libraryItems, resolveCover, resolveCoversBatch])

  useEffect(() => {
    let unlistenExtract: (() => void) | undefined
    void tauriClient.listenExtractStatus((event) => {
      dispatch(extractStatusReceived(event))
      const job = store.getState().queue.jobs.find((row) => row.id === event.jobId)
      if (job) {
        void refreshPathState(job.title, job.destPath, job.id)
      }
    }).then((fn) => {
      unlistenExtract = fn
    })
    return () => {
      unlistenExtract?.()
    }
  }, [dispatch, refreshPathState])

  const handlePickGameInstallFolder = useCallback(
    async (title: string, destPath: string, busyKey: string, jobId?: string) => {
      setSavePathError('')
      setInstallBusyId(busyKey)
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Onde instalou o jogo?',
          defaultPath: destPath || defaultDownloadPath || undefined,
        })
        if (typeof selected !== 'string') return

        const state = await sourcesApi.setLibraryGameRoot(title, destPath, selected, jobId)
        const cacheKey = pathStateKey(destPath, { jobId, title })
        setLibraryPathStateCacheEntry(cacheKey, state, defaultDownloadPathRef.current)
        setPathStateByKey((prev) => ({
          ...prev,
          [cacheKey]: state,
        }))
        if (!state.hasGame) {
          setSavePathError(
            'Pasta salva, mas ainda não encontramos o executável. Verifique se selecionou a pasta correta.',
          )
        }
      } catch (error) {
        setSavePathError(
          formatUserError(error, 'Não foi possível salvar a pasta de instalação.'),
        )
      } finally {
        setInstallBusyId(null)
      }
    },
    [defaultDownloadPath],
  )

  const handlePlayLibraryItem = useCallback(async (item: LibraryEntry) => {
    setSavePathError('')
    const busyKey = item.kind === 'job' ? item.id : item.destPath
    setPlayBusyId(busyKey)
    try {
      if (item.kind === 'job') {
        await queueApi.launchJob(item.id)
      } else {
        await sourcesApi.launchGame(item.title, item.destPath)
      }
    } catch (launchError) {
      setSavePathError(formatLaunchError(launchError))
    } finally {
      setPlayBusyId(null)
    }
  }, [])

  const handleExtractItem = useCallback(
    async (item: LibraryEntry) => {
      setSavePathError('')
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        await sourcesApi.extractLibraryFolder(item.title, item.destPath)
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        setSavePathError(formatUserError(error))
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState],
  )

  const handleInstallItem = useCallback(
    async (item: LibraryEntry) => {
      setSavePathError('')
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        await sourcesApi.launchSetup(item.title, item.destPath, jobId)
        watchForInstalledGame(item.title, item.destPath, jobId)
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        setSavePathError(formatUserError(error))
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState, watchForInstalledGame],
  )

  const handleDeleteLibraryItem = useCallback(
    async (item: LibraryEntry) => {
      const confirmed = await ask(
        `Deseja excluir "${item.title}"?\n\nOs arquivos da pasta de instalação também serão removidos e essa ação não pode ser desfeita.`,
        {
          title: 'Remover jogo',
          kind: 'warning',
        },
      )
      if (!confirmed) return

      const gameKey = libraryGameKey(item.title)
      const deletePath = resolveDeletePath(item.destPath)
      const relatedJobs = findRelatedLibraryJobs(item, jobs)

      setHiddenLibraryKeys((prev) => new Set(prev).add(gameKey))
      setLocalLibraryItems((prev) =>
        prev.filter((folder) => {
          if (!folder.isDir) return true
          if (libraryGameKey(folder.name) === gameKey) return false
          if (resolveDeletePath(folder.path).toLowerCase() === deletePath.toLowerCase()) return false
          return !relatedJobs.some((job) => jobPathsOverlap(folder.path, job.destPath))
        }),
      )
      for (const job of relatedJobs) {
        dispatch(removeJobLocally(job.id))
      }
      setPathStateByKey((prev) => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          const matchesPath = key.includes(deletePath.toLowerCase())
          const matchesJob = relatedJobs.some((job) => key === `job:${job.id}`)
          if (matchesPath || matchesJob) delete next[key]
        }
        removeLibraryPathStateCacheKeys(
          (key) =>
            key.includes(deletePath.toLowerCase()) ||
            relatedJobs.some((job) => key === `job:${job.id}`),
          defaultDownloadPathRef.current,
        )
        return next
      })

      try {
        if (deletePath) {
          try {
            await sourcesApi.deleteLocalLibraryItem(deletePath)
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (
              !msg.includes('local_item_not_found') &&
              !msg.includes('path_outside_default_download_path')
            ) {
              throw error
            }
          }
        }

        for (const job of relatedJobs) {
          try {
            await queueApi.removeJobFromLibrary(job.id)
          } catch {
            try {
              await dispatch(cancelJob(job.id)).unwrap()
            } catch {
              /* já removido localmente */
            }
          }
        }

        const scanned = await sourcesApi.scanDefaultDownloadPath()
        setLocalLibraryItems(
          scanned.filter((folder) => !folder.isDir || libraryGameKey(folder.name) !== gameKey),
        )
      } catch (error) {
        setHiddenLibraryKeys((prev) => {
          const next = new Set(prev)
          next.delete(gameKey)
          return next
        })
        setSavePathError(formatUserError(error, 'Falha ao excluir item.'))
        void dispatch(fetchJobs())
        const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => [] as LocalLibraryItem[])
        setLocalLibraryItems(scanned)
      }
    },
    [dispatch, jobs],
  )

  return {
    libraryItems,
    filteredEntries,
    libraryLoading,
    refreshLibraryScan,
    jobs,
    pathStateByKey,
    libraryFilter,
    librarySort,
    playBusyId,
    installBusyId,
    savePathError,
    clearSavePathError: () => setSavePathError(''),
    setLibraryFilter,
    setLibrarySort,
    onGoDownloads,
    onGoDiscover,
    resolveCover,
    invalidateLocalCover,
    handlePlayLibraryItem,
    handleInstallItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handleDeleteLibraryItem,
  }
}
