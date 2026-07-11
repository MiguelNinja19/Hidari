import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import type { AppDispatch } from '../../app/store'
import {
  cancelJob,
  fetchJobs,
  removeJobLocally,
} from '../queue/queueSlice'
import { queueApi } from '../../shared/api/tauri/queueApi'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { resolveDeletePath } from '../../shared/utils/archive'
import {
  formatLibraryDeleteError,
  isBenignDeleteError,
  isFileLockDeleteError,
  resolveLibraryDeletePaths,
} from '../../shared/utils/libraryDelete'
import { activeJobBlocksLibraryFolder, normalizeLibraryPath } from '../../shared/utils/jobExtraction'
import {
  dedupeLibraryEntries,
  findRelatedLibraryJobs,
  libraryTitlesMatch,
} from '../../shared/utils/libraryDedupe'
import {
  itemAwaitingInstall,
  isActiveQueueJob,
  isJobFinished,
  isPathStateResolved,
  isPlayableLibraryItem,
  jobBelongsInLibrary,
  jobPathCtx,
  itemPathCtx,
  needsInstallItem,
  pathStateKey,
  showLocateInstallAction,
} from './libraryItemState'
import { coverTitleKey, libraryGameKeyCandidates } from '../../shared/utils/normalizeTitleKey'
import { useToast } from '../../shared/components/ToastProvider'
import { formatLaunchError } from '../../shared/utils/launchErrors'
import { formatUserError } from '../../shared/utils/formatUserError'
import {
  INSTALL_WATCH_INTERVAL_MS,
  INSTALL_WATCH_MAX_TICKS,
  INSTALL_WATCH_POST_CLOSE_TICKS,
  INSTALL_WATCH_START_GRACE_TICKS,
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

type InstallWatch = {
  intervalId: number
  busyKey: string
  setupPath: string
  ticks: number
  sawInstallerRunning: boolean
  installerClosedTick: number | null
}

const normalizeDownloadPath = (path: string) => path.trim().replace(/\\/g, '/').toLowerCase()

const scoreLibraryEntry = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: LibraryControllerValue['pathStateByKey'],
  defaultDownloadPath: string,
): number => {
  if (isPlayableLibraryItem(item, jobs, pathStateByKey, defaultDownloadPath)) return 100
  if (itemAwaitingInstall(item, jobs, pathStateByKey)) {
    return item.kind === 'job' ? 90 : 70
  }
  if (
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  ) {
    return 85
  }
  if (showLocateInstallAction(item, jobs, pathStateByKey)) return 45
  if (item.kind === 'folder' && !isPathStateResolved(item, pathStateByKey)) return 40
  if (item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')) return 80
  if (needsInstallItem(item, pathStateByKey)) return 60
  if (item.kind === 'folder') return 35
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
  queueInitialized: boolean
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
  queueInitialized,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
  resolveCover,
  resolveCoversBatch,
  invalidateLocalCover,
}: UseLibraryControllerStateArgs): LibraryControllerValue {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [libraryFilter, setLibraryFilter] = useState('')
  const [librarySort, setLibrarySortState] = useState<LibrarySort>('title-asc')
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [libraryScanSettled, setLibraryScanSettled] = useState(false)
  const [pathStateByKey, setPathStateByKey] = useState<LibraryControllerValue['pathStateByKey']>({})
  const [playBusyId, setPlayBusyId] = useState<string | null>(null)
  const [installBusyId, setInstallBusyId] = useState<string | null>(null)
  const [installingKeys, setInstallingKeys] = useState<Set<string>>(() => new Set())
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(() => new Set())
  const [pendingDeleteItem, setPendingDeleteItem] = useState<LibraryEntry | null>(null)
  const [deletingLibraryKey, setDeletingLibraryKey] = useState<string | null>(null)

  const installWatchRef = useRef<Map<string, InstallWatch>>(new Map())
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

  const inspectAllLibraryPaths = useCallback(async () => {
    if (!defaultDownloadPathRef.current.trim()) {
      setLibraryScanSettled(true)
      return
    }
    try {
      const items = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(items)
      await runBatchPathInspection(items, jobsRef.current)
    } catch (error) {
      showError(formatUserError(error, t('library.verifyPathError')))
    } finally {
      setLibraryScanSettled(true)
    }
  }, [runBatchPathInspection, showError, t])

  useEffect(() => {
    const path = defaultDownloadPath.trim()
    if (!path) return

    const normalized = normalizeDownloadPath(path)
    const previous = knownDownloadPathRef.current

    if (!previous) {
      const persisted = hydrateLibraryPathStateCache(path)
      setPathStateByKey({ ...persisted })
      knownDownloadPathRef.current = normalized
      void inspectAllLibraryPaths()
      return
    }

    if (previous === normalized) return

    clearLibraryPathStateCache()
    setPathStateByKey({})
    knownDownloadPathRef.current = normalized
    void inspectAllLibraryPaths()
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

  const addInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((prev) => {
      if (prev.has(busyKey)) return prev
      const next = new Set(prev)
      next.add(busyKey)
      return next
    })
  }, [])

  const removeInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((prev) => {
      if (!prev.has(busyKey)) return prev
      const next = new Set(prev)
      next.delete(busyKey)
      return next
    })
  }, [])

  const stopInstallWatch = useCallback(
    (watchKey: string) => {
      const watch = installWatchRef.current.get(watchKey)
      if (!watch) return
      window.clearInterval(watch.intervalId)
      installWatchRef.current.delete(watchKey)
      removeInstallingKey(watch.busyKey)
    },
    [removeInstallingKey],
  )

  const watchForInstalledGame = useCallback(
    (title: string, destPath: string, busyKey: string, setupPath: string, jobId?: string) => {
      const watchKey = pathStateKey(destPath, { jobId, title })
      const existing = installWatchRef.current.get(watchKey)
      if (existing) {
        window.clearInterval(existing.intervalId)
        installWatchRef.current.delete(watchKey)
      }
      addInstallingKey(busyKey)

      const tick = async () => {
        const watch = installWatchRef.current.get(watchKey)
        if (!watch) return
        watch.ticks += 1

        try {
          const state = await refreshPathState(title, destPath, jobId)
          if (state.hasGame) {
            stopInstallWatch(watchKey)
            return
          }
        } catch {
          // continua a monitorizar
        }

          if (watch.setupPath && watch.ticks > INSTALL_WATCH_START_GRACE_TICKS) {
          let running = false
          try {
            running = await sourcesApi.isExecutableRunning(watch.setupPath)
          } catch {
            // keep false
          }

          if (running) {
            watch.sawInstallerRunning = true
            watch.installerClosedTick = null
          } else if (watch.sawInstallerRunning) {
            if (watch.installerClosedTick === null) {
              watch.installerClosedTick = watch.ticks
            } else if (watch.ticks - watch.installerClosedTick >= INSTALL_WATCH_POST_CLOSE_TICKS) {
              stopInstallWatch(watchKey)
              return
            }
          }
        }

        if (watch.ticks >= INSTALL_WATCH_MAX_TICKS) {
          stopInstallWatch(watchKey)
        }
      }

      const intervalId = window.setInterval(() => {
        void tick()
      }, INSTALL_WATCH_INTERVAL_MS)
      installWatchRef.current.set(watchKey, {
        intervalId,
        busyKey,
        setupPath,
        ticks: 0,
        sawInstallerRunning: false,
        installerClosedTick: null,
      })
      void tick()
    },
    [addInstallingKey, refreshPathState, stopInstallWatch],
  )

  useEffect(() => {
    const watches = installWatchRef.current
    return () => {
      for (const watch of watches.values()) {
        window.clearInterval(watch.intervalId)
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

  const refreshLibraryScan = useCallback(
    (_options?: { background?: boolean }) => {
      if (!defaultDownloadPathRef.current.trim()) {
        setLibraryScanSettled(true)
        return Promise.resolve()
      }
      return sourcesApi
        .scanDefaultDownloadPath()
        .then(async (items) => {
          setLocalLibraryItems(items)
          await runBatchPathInspection(items, jobsRef.current, { onlyUnresolved: true })
        })
        .catch((error) => {
          showError(formatUserError(error, t('library.readPathError')))
        })
        .finally(() => {
          setLibraryScanSettled(true)
        })
    },
    [runBatchPathInspection],
  )

  useEffect(() => {
    if (activeTab !== 'library') return
    refreshLibraryScan({ background: true })
  }, [activeTab, refreshLibraryScan])

  const baseLibraryEntries = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase()

    const jobPaths = new Set(
      jobs
        .filter((job) => jobBelongsInLibrary(job))
        .map((job) => resolveDeletePath(job.destPath).toLowerCase())
        .filter(Boolean),
    )

    const folderEntries: LibraryEntry[] = localLibraryItems
      .filter((item) => item.isDir)
      .filter((item) => {
        const folderPath = item.path.toLowerCase()
        if (jobPaths.has(folderPath)) return false

        const hasRelatedLibraryJob = jobs.some(
          (job) =>
            jobBelongsInLibrary(job) &&
            (libraryTitlesMatch(job.title, item.name) ||
              activeJobBlocksLibraryFolder(item.path, job.destPath, defaultDownloadPath)),
        )
        if (hasRelatedLibraryJob) return false

        const hasIncompleteJob = jobs.some(
          (job) =>
            !jobBelongsInLibrary(job) &&
            job.status !== 'cancelled' &&
            libraryTitlesMatch(job.title, item.name),
        )
        if (hasIncompleteJob) return false

        const blockedByActiveJob = jobs.some(
          (job) =>
            isActiveQueueJob(job) &&
            activeJobBlocksLibraryFolder(item.path, job.destPath, defaultDownloadPath),
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
      .filter((job) => jobBelongsInLibrary(job))
      .map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        destPath: job.destPath,
        kind: 'job' as const,
        job,
      }))

    const merged = dedupeLibraryEntries([...jobEntries, ...folderEntries], (item) =>
      scoreLibraryEntry(item, jobs, pathStateByKey, defaultDownloadPath),
    ).filter(
      (item) =>
        !libraryGameKeyCandidates(item.title).some((key) => hiddenLibraryKeys.has(key)),
    )

    if (!normalizedFilter) return merged
    return merged.filter((item) => item.title.toLowerCase().includes(normalizedFilter))
  }, [jobs, localLibraryItems, libraryFilter, pathStateByKey, hiddenLibraryKeys, defaultDownloadPath])

  const filteredEntries = useMemo(
    () => sortLibraryEntries(baseLibraryEntries, librarySort),
    [baseLibraryEntries, librarySort],
  )

  const libraryItems = filteredEntries
  const libraryReady = queueInitialized && libraryScanSettled

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

  const handlePickGameInstallFolder = useCallback(
    async (title: string, destPath: string, busyKey: string, jobId?: string) => {
      setInstallBusyId(busyKey)
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: t('library.pickInstallFolderTitle'),
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
          showError(t('library.pickInstallFolderWarning'))
        }
      } catch (error) {
        showError(formatUserError(error, t('library.pickInstallFolderError')))
      } finally {
        setInstallBusyId(null)
      }
    },
    [defaultDownloadPath, showError, t],
  )

  const handlePlayLibraryItem = useCallback(async (item: LibraryEntry) => {
    const busyKey = item.kind === 'job' ? item.id : item.destPath
    setPlayBusyId(busyKey)
    try {
      if (item.kind === 'job') {
        await queueApi.launchJob(item.id)
      } else {
        await sourcesApi.launchGame(item.title, item.destPath)
      }
    } catch (launchError) {
      showError(formatLaunchError(launchError))
    } finally {
      setPlayBusyId(null)
    }
  }, [])

  const handleExtractItem = useCallback(
    async (item: LibraryEntry) => {
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        await sourcesApi.extractLibraryFolder(item.title, item.destPath)
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        showError(formatUserError(error))
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState],
  )

  const handleInstallItem = useCallback(
    async (item: LibraryEntry) => {
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        const setupPath = await sourcesApi.launchSetup(item.title, item.destPath, jobId)
        watchForInstalledGame(item.title, item.destPath, busyKey, setupPath, jobId)
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        showError(formatUserError(error))
        removeInstallingKey(busyKey)
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState, removeInstallingKey, watchForInstalledGame, showError],
  )

  const handleDeleteLibraryItem = useCallback((item: LibraryEntry) => {
    setPendingDeleteItem(item)
  }, [])

  const handleCancelDeleteLibraryItem = useCallback(() => {
    if (deletingLibraryKey) return
    setPendingDeleteItem(null)
  }, [deletingLibraryKey])

  const handleConfirmDeleteLibraryItem = useCallback(async () => {
    const item = pendingDeleteItem
    if (!item || deletingLibraryKey) return

    const busyKey = item.kind === 'job' ? item.id : item.destPath
    setDeletingLibraryKey(busyKey)

    const hideKeys = libraryGameKeyCandidates(item.title)
    const deletePath = resolveDeletePath(item.destPath)
    const relatedJobs = findRelatedLibraryJobs(item, jobs, defaultDownloadPath)
    const watchKey = pathStateKey(item.destPath, itemPathCtx(item))
    const activeWatch = installWatchRef.current.get(watchKey)
    if (activeWatch) {
      window.clearInterval(activeWatch.intervalId)
      installWatchRef.current.delete(watchKey)
    }
    removeInstallingKey(busyKey)

    setHiddenLibraryKeys((prev) => new Set([...prev, ...hideKeys]))
    setLocalLibraryItems((prev) =>
      prev.filter((folder) => {
        if (!folder.isDir) return true
        if (libraryTitlesMatch(folder.name, item.title)) return false
        if (resolveDeletePath(folder.path).toLowerCase() === deletePath.toLowerCase()) return false
        return !relatedJobs.some(
          (job) =>
            libraryTitlesMatch(folder.name, job.title) ||
            normalizeLibraryPath(folder.path) === normalizeLibraryPath(job.destPath),
        )
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
      const scannedFolders =
        (await sourcesApi.scanDefaultDownloadPath().catch(() => localLibraryItems)) ??
        localLibraryItems
      const pathsToDelete = resolveLibraryDeletePaths(
        item,
        scannedFolders,
        defaultDownloadPath,
        relatedJobs,
      )

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

      const deleteErrors: unknown[] = []
      for (const path of pathsToDelete) {
        try {
          await sourcesApi.deleteLocalLibraryItem(path)
        } catch (error) {
          if (isBenignDeleteError(error)) continue
          deleteErrors.push(error)
        }
      }

      const scanned = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(
        scanned.filter(
          (folder) => !folder.isDir || !libraryTitlesMatch(folder.name, item.title),
        ),
      )

      if (deleteErrors.length > 0) {
        if (deleteErrors.some(isFileLockDeleteError)) {
          showError(formatLibraryDeleteError(deleteErrors))
          return
        }
        throw deleteErrors[0]
      }
      setPendingDeleteItem(null)
    } catch (error) {
      if (isFileLockDeleteError(error)) {
        showError(formatLibraryDeleteError([error]))
        const scanned = await sourcesApi
          .scanDefaultDownloadPath()
          .catch(() => [] as LocalLibraryItem[])
        setLocalLibraryItems(
          scanned.filter(
            (folder) => !folder.isDir || !libraryTitlesMatch(folder.name, item.title),
          ),
        )
        setPendingDeleteItem(null)
        return
      }

      setHiddenLibraryKeys((prev) => {
        const next = new Set(prev)
        for (const key of hideKeys) next.delete(key)
        return next
      })
      showError(formatUserError(error, t('library.deleteError')))
      void dispatch(fetchJobs())
      const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => [] as LocalLibraryItem[])
      setLocalLibraryItems(scanned)
      setPendingDeleteItem(null)
    } finally {
      setDeletingLibraryKey(null)
    }
  }, [
    pendingDeleteItem,
    deletingLibraryKey,
    dispatch,
    jobs,
    defaultDownloadPath,
    localLibraryItems,
    removeInstallingKey,
    showError,
    t,
  ])

  return {
    libraryItems,
    filteredEntries,
    libraryReady,
    refreshLibraryScan,
    defaultDownloadPath,
    jobs,
    pathStateByKey,
    libraryFilter,
    librarySort,
    playBusyId,
    installBusyId,
    installingKeys,
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
    handleConfirmDeleteLibraryItem,
    handleCancelDeleteLibraryItem,
    pendingDeleteItem,
    deletingLibraryKey,
  }
}
