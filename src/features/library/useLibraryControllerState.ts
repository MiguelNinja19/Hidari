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
import { formatLaunchError } from '../../shared/utils/launchErrors'
import {
  INSTALL_WATCH_INTERVAL_MS,
  INSTALL_WATCH_MAX_TICKS,
  LIBRARY_COVER_LOOKUP_DEBOUNCE_MS,
  PATH_INSPECT_FOCUS_DEBOUNCE_MS,
  PENDING_INSTALL_POLL_MS,
} from '../../shared/config/polling'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'
import type { LibraryControllerValue } from './LibraryController'
import {
  isJobFinished,
  isPlayableLibraryItem,
  jobNeedsInstall,
  jobPathCtx,
  needsInstallItem,
  pathStateKey,
} from './libraryItemState'
import type { LibraryEntry } from './types'

type UseLibraryControllerStateArgs = {
  activeTab: NavTab
  jobs: DownloadJob[]
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
  resolveCover: LibraryControllerValue['resolveCover']
  lookupMissingLibraryCover: (title: string) => void
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
  lookupMissingLibraryCover,
  invalidateLocalCover,
}: UseLibraryControllerStateArgs): LibraryControllerValue {
  const [libraryFilter, setLibraryFilter] = useState('')
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<
    'all' | 'installed' | 'not_installed'
  >('all')
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [pathStateByKey, setPathStateByKey] = useState<LibraryControllerValue['pathStateByKey']>({})
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(() => new Set())
  const [savePathError, setSavePathError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [playBusyId, setPlayBusyId] = useState<string | null>(null)
  const [installBusyId, setInstallBusyId] = useState<string | null>(null)

  const installWatchRef = useRef<Map<string, number>>(new Map())
  const pathStateByKeyRef = useRef(pathStateByKey)
  const refreshInstallableDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    pathStateByKeyRef.current = pathStateByKey
  }, [pathStateByKey])

  const refreshPathState = useCallback(async (title: string, path: string, jobId?: string) => {
    const key = pathStateKey(path, { jobId, title })
    const state = await sourcesApi.inspectLibraryPath(title, path, jobId)
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
            setActionMessage('Instalação concluída — pode jogar.')
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

  const refreshInstallablePaths = useCallback(() => {
    const states = pathStateByKeyRef.current
    for (const job of jobs) {
      if (!isJobFinished(job)) continue
      const state = states[pathStateKey(job.destPath, jobPathCtx(job))]
      if (state?.hasGame) continue
      void refreshPathState(job.title, job.destPath, job.id)
    }
    const jobPaths = new Set(
      jobs.map((job) => resolveDeletePath(job.destPath).toLowerCase()).filter(Boolean),
    )
    for (const item of localLibraryItems) {
      if (!item.isDir) continue
      if (jobPaths.has(item.path.toLowerCase())) continue
      const state = states[pathStateKey(item.path, { title: item.name })]
      if (state?.hasGame) continue
      void refreshPathState(item.name, item.path)
    }
  }, [jobs, localLibraryItems, refreshPathState])

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
    if (activeTab !== 'library') return
    refreshInstallablePaths()
  }, [activeTab, refreshInstallablePaths])

  useEffect(() => {
    if (activeTab !== 'library') return

    const debouncedRefresh = () => {
      if (refreshInstallableDebounceRef.current != null) {
        window.clearTimeout(refreshInstallableDebounceRef.current)
      }
      refreshInstallableDebounceRef.current = window.setTimeout(() => {
        refreshInstallablePaths()
      }, PATH_INSPECT_FOCUS_DEBOUNCE_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        debouncedRefresh()
      }
    }
    window.addEventListener('focus', debouncedRefresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', debouncedRefresh)
      document.removeEventListener('visibilitychange', onVisible)
      if (refreshInstallableDebounceRef.current != null) {
        window.clearTimeout(refreshInstallableDebounceRef.current)
      }
    }
  }, [activeTab, refreshInstallablePaths])

  const pendingInstallSignature = useMemo(
    () =>
      jobs
        .filter((job) => isJobFinished(job) && jobNeedsInstall(job, pathStateByKey))
        .map((job) => job.id)
        .join('|'),
    [jobs, pathStateByKey],
  )

  useEffect(() => {
    if (activeTab !== 'library' || !pendingInstallSignature) return
    refreshInstallablePaths()
    const timer = window.setInterval(refreshInstallablePaths, PENDING_INSTALL_POLL_MS)
    return () => window.clearInterval(timer)
  }, [activeTab, pendingInstallSignature, refreshInstallablePaths])

  const refreshLibraryScan = useCallback(() => {
    void sourcesApi
      .scanDefaultDownloadPath()
      .then((items) => setLocalLibraryItems(items))
      .catch(() => {
        /* mantém lista anterior */
      })
  }, [])

  useEffect(() => {
    if (activeTab !== 'library') return
    refreshLibraryScan()
    void dispatch(fetchJobs())
  }, [activeTab, dispatch, refreshLibraryScan])

  useEffect(() => {
    if (!defaultDownloadPath.trim()) return
    refreshLibraryScan()
  }, [defaultDownloadPath, refreshLibraryScan])

  const jobPathSignature = jobs
    .map((job) => `${job.id}:${job.status}:${job.destPath}`)
    .join('|')
  const libraryPathSignature = localLibraryItems
    .filter((item) => item.isDir)
    .map((item) => item.path)
    .sort()
    .join('|')

  useEffect(() => {
    if (activeTab !== 'library') return

    let cancelled = false
    const candidates = new Map<string, { title: string; path: string; jobId?: string }>()
    for (const job of jobs) {
      const pathKey = pathStateKey(job.destPath, jobPathCtx(job))
      if (job.destPath.trim()) {
        candidates.set(pathKey, { title: job.title, path: job.destPath, jobId: job.id })
      }
    }
    for (const item of localLibraryItems) {
      if (!item.isDir) continue
      const pathKey = pathStateKey(item.path, { title: item.name })
      if (!candidates.has(pathKey)) {
        candidates.set(pathKey, { title: item.name, path: item.path })
      }
    }
    if (candidates.size === 0) {
      return () => {
        cancelled = true
      }
    }

    void Promise.all(
      [...candidates.entries()].map(async ([pathKey, entry]) => {
        try {
          const state = await sourcesApi.inspectLibraryPath(
            entry.title,
            entry.path,
            entry.jobId,
          )
          return [pathKey, state] as const
        } catch {
          return [
            pathKey,
            {
              playable: false,
              hasGame: false,
              needsInstall: false,
              needsExtraction: false,
              installPath: null,
            },
          ] as const
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        setPathStateByKey((prev) => ({ ...prev, ...Object.fromEntries(results) }))
      }
    })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable path signatures
  }, [activeTab, jobPathSignature, libraryPathSignature])

  const libraryItems = useMemo(() => {
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

    const scoreLibraryEntry = (item: LibraryEntry): number => {
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

    const merged = dedupeLibraryEntries([...jobEntries, ...folderEntries], scoreLibraryEntry)
      .filter((item) => !hiddenLibraryKeys.has(libraryGameKey(item.title)))

    const sorted = merged.sort((a, b) =>
      b.title.localeCompare(a.title, 'pt', { sensitivity: 'base' }),
    )

    const byStatus = sorted.filter((item) => {
      if (libraryStatusFilter === 'installed') {
        return isPlayableLibraryItem(item, jobs, pathStateByKey)
      }
      if (libraryStatusFilter === 'not_installed') {
        return item.kind === 'job' && !isPlayableLibraryItem(item, jobs, pathStateByKey)
      }
      return true
    })

    if (!normalizedFilter) return byStatus
    return byStatus.filter((item) => item.title.toLowerCase().includes(normalizedFilter))
  }, [jobs, localLibraryItems, libraryFilter, libraryStatusFilter, pathStateByKey, hiddenLibraryKeys])

  useEffect(() => {
    if (activeTab !== 'library') return
    const timer = window.setTimeout(() => {
      for (const item of libraryItems) {
        lookupMissingLibraryCover(item.title)
      }
    }, LIBRARY_COVER_LOOKUP_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [activeTab, libraryItems, lookupMissingLibraryCover])

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
      setActionMessage('')
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
        setPathStateByKey((prev) => ({
          ...prev,
          [pathStateKey(destPath, { jobId, title })]: state,
        }))
        if (state.hasGame) {
          setActionMessage('Pasta de instalação guardada — pode jogar.')
        } else {
          setSavePathError(
            'Pasta salva, mas ainda não encontramos o executável. Verifique se selecionou a pasta correta.',
          )
        }
      } catch (error) {
        setSavePathError(
          error instanceof Error ? error.message : 'Não foi possível salvar a pasta de instalação.',
        )
      } finally {
        setInstallBusyId(null)
      }
    },
    [defaultDownloadPath],
  )

  const handlePlayLibraryItem = useCallback(async (item: LibraryEntry) => {
    setSavePathError('')
    setActionMessage('')
    const busyKey = item.kind === 'job' ? item.id : item.destPath
    setPlayBusyId(busyKey)
    try {
      let launched = ''
      if (item.kind === 'job') {
        launched = await queueApi.launchJob(item.id)
      } else {
        launched = await sourcesApi.launchGame(item.title, item.destPath)
      }
      const name = launched.split(/[/\\]/).pop() ?? launched
      setActionMessage(`Iniciando ${name}…`)
    } catch (launchError) {
      setSavePathError(formatLaunchError(launchError))
    } finally {
      setPlayBusyId(null)
    }
  }, [])

  const handleExtractItem = useCallback(
    async (item: LibraryEntry) => {
      setSavePathError('')
      setActionMessage('Extraindo arquivos…')
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        await sourcesApi.extractLibraryFolder(item.title, item.destPath)
        setActionMessage('Extração em andamento. Quando terminar, clique em Instalar.')
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        setSavePathError(formatLaunchError(error))
        setActionMessage('')
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState],
  )

  const handleInstallItem = useCallback(
    async (item: LibraryEntry) => {
      setSavePathError('')
      setActionMessage('Abrindo instalador…')
      const busyKey = item.kind === 'job' ? item.id : item.destPath
      const jobId = item.kind === 'job' ? item.id : undefined
      setInstallBusyId(busyKey)
      try {
        await sourcesApi.launchSetup(item.title, item.destPath, jobId)
        setActionMessage('Siga o assistente na janela do instalador.')
        watchForInstalledGame(item.title, item.destPath, jobId)
        await refreshPathState(item.title, item.destPath, jobId)
      } catch (error) {
        setSavePathError(formatLaunchError(error))
        setActionMessage('')
      } finally {
        setInstallBusyId(null)
      }
    },
    [refreshPathState, watchForInstalledGame],
  )

  const handleDeleteLibraryItem = useCallback(
    async (item: LibraryEntry) => {
      const confirmed = await ask(`Excluir "${item.title}" e os arquivos na pasta de instalação?`, {
        title: 'Confirmar exclusão',
        kind: 'warning',
      })
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
        setSavePathError(error instanceof Error ? error.message : 'Falha ao excluir item.')
        void dispatch(fetchJobs())
        const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => [] as LocalLibraryItem[])
        setLocalLibraryItems(scanned)
      }
    },
    [dispatch, jobs],
  )

  return {
    libraryItems,
    jobs,
    pathStateByKey,
    libraryFilter,
    libraryStatusFilter,
    playBusyId,
    installBusyId,
    savePathError,
    actionMessage,
    setLibraryFilter,
    setLibraryStatusFilter,
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
