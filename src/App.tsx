import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { open, ask } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { store } from './app/store'
import { addSource, fetchSources } from './features/sources/sourcesSlice'
import {
  enqueueJob,
  fetchJobs,
  pauseJob,
  resumeJob,
  cancelJob,
  clearCompletedJobs,
  extractStatusReceived,
  removeJobLocally,
  jobProgressReceived,
} from './features/queue/queueSlice'
import { queueApi } from './shared/api/tauri/queueApi'
import { tauriClient } from './shared/api/tauri/client'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import { resolveDeletePath } from './shared/utils/archive'
import { jobPathsOverlap } from './shared/utils/jobExtraction'
import { dedupeLibraryEntries, findRelatedLibraryJobs, libraryGameKey } from './shared/utils/libraryDedupe'
import { useGameCovers } from './features/covers/useGameCovers'
import { AppShell } from './layout/AppShell'
import type { NavTab } from './layout/types'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { DownloadsPage } from './features/downloads/DownloadsPage'
import { LibraryPage } from './features/library/LibraryPage'
import { SettingsPage } from './features/settings/SettingsPage'
import type { LibraryEntry } from './features/library/types'
import { formatLaunchError } from './shared/utils/launchErrors'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  metadataPhaseDetail,
  resolveJobProgressPercent,
} from './shared/utils/jobProgress'
import type { CatalogGame, DownloadJob, DownloadOption, LibraryPathState, LocalLibraryItem } from './shared/types/contracts'
import './App.css'


const SETTING_KEY = {
  installOrganization: 'install_organization',
  afterInstallAction: 'after_install_action',
  verifyAfterDownload: 'verify_after_download',
  removeTempFiles: 'remove_temp_files',
  downloadSpeedLimitBps: 'download_speed_limit_bps',
  disabledHydraSourceIds: 'disabled_hydra_source_ids',
} as const

const speedKeyToBps = (k: string) => {
  switch (k) {
    case '50mb':
      return 50 * 1024 * 1024
    case '20mb':
      return 20 * 1024 * 1024
    case '10mb':
      return 10 * 1024 * 1024
    default:
      return 0
  }
}

const bpsToSpeedKey = (value: string | null | undefined) => {
  if (value == null || value === '' || value === '0') return 'ilimitado'
  const n = Number(value)
  if (n === 50 * 1024 * 1024) return '50mb'
  if (n === 20 * 1024 * 1024) return '20mb'
  if (n === 10 * 1024 * 1024) return '10mb'
  return 'ilimitado'
}

const buildSourceSearchQuery = (title: string) => {
  const cleaned = title.replace(/[™®©]/g, '').trim()
  const head = cleaned.split(':')[0]?.split(' - ')[0]?.trim()
  return head || cleaned
}

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === 'torrent' ||
  (option.downloadType === 'http' && !option.url.includes('fitgirl-repacks.site/'))

const pathStateKey = (
  path: string,
  ctx?: { jobId?: string; title?: string },
) => {
  if (ctx?.jobId) return `job:${ctx.jobId}`
  const base = resolveDeletePath(path).toLowerCase()
  if (ctx?.title) return `${base}::${ctx.title.trim().toLowerCase()}`
  return base
}

const getPathState = (
  path: string,
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => pathStateByKey[pathStateKey(path, ctx)]

const jobPathCtx = (job: DownloadJob) => ({ jobId: job.id, title: job.title })

const itemPathCtx = (item: LibraryEntry) => ({
  jobId: item.kind === 'job' ? item.id : undefined,
  title: item.title,
})

const itemHasGame = (
  path: string,
  pathStateByKey: Record<string, LibraryPathState>,
  ctx?: { jobId?: string; title?: string },
) => {
  const state = getPathState(path, pathStateByKey, ctx)
  return state?.hasGame === true || state?.playable === true
}

const isPlayableLibraryItem = (
  item: LibraryEntry,
  allJobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  if (needsInstallItem(item, pathStateByKey)) return false

  const hasGame = itemHasGame(item.destPath, pathStateByKey, itemPathCtx(item))
  if (!hasGame) return false

  if (item.kind === 'job') {
    return true
  }

  const folderPath = item.destPath
  const blockedByActiveJob = allJobs.some(
    (job) =>
      job.status !== 'extracted' &&
      job.status !== 'cancelled' &&
      !itemHasGame(job.destPath, pathStateByKey, jobPathCtx(job)) &&
      jobPathsOverlap(folderPath, job.destPath),
  )
  return !blockedByActiveJob
}

const needsInstallItem = (
  item: LibraryEntry,
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  return state?.needsInstall === true
}

const jobNeedsInstall = (job: DownloadJob, pathStateByKey: Record<string, LibraryPathState>) => {
  const state = getPathState(job.destPath, pathStateByKey, jobPathCtx(job))
  return state?.needsInstall === true
}

const isJobFinished = (job: DownloadJob) =>
  job.status === 'extracted' ||
  job.status === 'completed' ||
  job.status === 'seeding' ||
  job.status === 'skipped' ||
  (job.progress >= 99 &&
    !['downloading', 'pending', 'retrying', 'cancelled', 'extracting'].includes(job.status))

const itemAwaitingInstall = (
  item: LibraryEntry,
  allJobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  if (isPlayableLibraryItem(item, allJobs, pathStateByKey)) return false

  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  if (state?.needsInstall || state?.needsExtraction) return true

  if (item.kind === 'job') {
    if (
      ['downloading', 'pending', 'retrying', 'extracting', 'paused', 'cancelled'].includes(
        item.status,
      )
    ) {
      return false
    }
    if (
      item.status === 'extracted' ||
      item.status === 'completed' ||
      item.status === 'seeding' ||
      item.status === 'skipped' ||
      (item.job && isJobFinished(item.job))
    ) {
      return !itemHasGame(item.destPath, pathStateByKey, itemPathCtx(item))
    }
  }

  return false
}

const showPlayAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => isPlayableLibraryItem(item, jobs, pathStateByKey)

const showInstallAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => itemAwaitingInstall(item, jobs, pathStateByKey)

const showLocateInstallAction = (
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  if (showPlayAction(item, jobs, pathStateByKey)) return false
  if (itemAwaitingInstall(item, jobs, pathStateByKey)) return false
  if (item.kind === 'job' && item.job && !isJobFinished(item.job)) return false
  return true
}

const hasManualInstallRoot = (
  item: LibraryEntry,
  pathStateByKey: Record<string, LibraryPathState>,
) => {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  return Boolean(state?.customGameRoot?.trim())
}

function libraryStatusMeta(
  item: LibraryEntry,
  jobs: DownloadJob[],
  pathStateByKey: Record<string, LibraryPathState>,
): { label: string; tone: string } {
  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))

  if (itemAwaitingInstall(item, jobs, pathStateByKey)) {
    return { label: 'Instalar', tone: 'waiting' }
  }
  if (state?.hasGame || state?.playable || isPlayableLibraryItem(item, jobs, pathStateByKey)) {
    return { label: 'Jogar', tone: 'ready' }
  }
  if (item.kind === 'folder') {
    return { label: 'Na biblioteca', tone: 'idle' }
  }
  if (
    item.status === 'downloading' ||
    item.status === 'pending' ||
    item.status === 'retrying'
  ) {
    const asJob: DownloadJob = item.job ?? {
      id: item.id,
      title: item.title,
      url: '',
      destPath: item.destPath,
      status: item.status,
      priority: 0,
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      errorMsg: null,
      createdAt: '',
      updatedAt: '',
    }
    if (isTorrentMetadataPhase(asJob)) {
      return { label: 'A ligar peers', tone: 'downloading' }
    }
    const pct = resolveJobProgressPercent(asJob)
    const pctLabel =
      pct > 0 && pct < 100 ? `${pct.toFixed(1).replace('.', ',')}%` : pct >= 100 ? '100%' : ''
    return {
      label: pctLabel ? `A transferir · ${pctLabel}` : 'A transferir',
      tone: 'downloading',
    }
  }
  if (item.status === 'paused') {
    return { label: 'Pausado', tone: 'paused' }
  }
  if (item.status === 'failed') {
    return { label: 'Falhou', tone: 'failed' }
  }
  return { label: 'Aguardando', tone: 'idle' }
}

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)

  const [sourceUrl, setSourceUrl] = useState<string>('')
  const [discoverSearch, setDiscoverSearch] = useState<string>('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState<string>('')
  const [savePathError, setSavePathError] = useState<string>('')
  const [actionMessage, setActionMessage] = useState<string>('')
  const [playBusyId, setPlayBusyId] = useState<string | null>(null)
  const [installBusyId, setInstallBusyId] = useState<string | null>(null)
  const [discoverError, setDiscoverError] = useState<string>('')
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(null)
  const [discoverPickOptions, setDiscoverPickOptions] = useState<DownloadOption[]>([])
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false)
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(null)
  const [downloadsBooting, setDownloadsBooting] = useState(false)
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState<boolean>(true)
  const [verifyAfterDownload, setVerifyAfterDownload] = useState<boolean>(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState<boolean>(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState<string>('ilimitado')
  const [installOrganization, setInstallOrganization] = useState<string>('separate-folder')
  const [afterInstallAction, setAfterInstallAction] = useState<string>('ask')
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [libraryFilter, setLibraryFilter] = useState<string>('')
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<
    'all' | 'installed' | 'not_installed'
  >('all')
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [pathStateByKey, setPathStateByKey] = useState<Record<string, LibraryPathState>>({})
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(() => new Set())
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
        if (ticks >= 90 && installWatchRef.current.has(watchKey)) {
          window.clearInterval(intervalId)
          installWatchRef.current.delete(watchKey)
        }
      }, 2000)
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
      }, 1500)
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
    const timer = window.setInterval(refreshInstallablePaths, 6000)
    return () => window.clearInterval(timer)
  }, [activeTab, pendingInstallSignature, refreshInstallablePaths])

  const refreshLibraryScan = useCallback(() => {
    void sourcesApi
      .scanDefaultDownloadPath()
      .then((items) => setLocalLibraryItems(items))
      .catch(() => {
        /* mantém lista anterior se o scan falhar */
      })
  }, [])

  useEffect(() => {
    void dispatch(fetchSources())
    void sourcesApi.syncSources().then(() => dispatch(fetchSources()))
    void dispatch(fetchJobs())

    void (async () => {
      try {
        const path = await sourcesApi.getDefaultDownloadPath()
        if (path) {
          setDefaultDownloadPath(path)
          const scanned = await sourcesApi.scanDefaultDownloadPath()
          setLocalLibraryItems(scanned)
        }
        const enabled = await sourcesApi.getSeedTorrentsEnabled()
        setSeedTorrentsEnabled(enabled)
        const [org, after, ver, rem, speed, dis] = await Promise.all([
          sourcesApi.getAppSetting(SETTING_KEY.installOrganization),
          sourcesApi.getAppSetting(SETTING_KEY.afterInstallAction),
          sourcesApi.getAppSetting(SETTING_KEY.verifyAfterDownload),
          sourcesApi.getAppSetting(SETTING_KEY.removeTempFiles),
          sourcesApi.getAppSetting(SETTING_KEY.downloadSpeedLimitBps),
          sourcesApi.getAppSetting(SETTING_KEY.disabledHydraSourceIds),
        ])
        if (org) setInstallOrganization(org)
        if (after) setAfterInstallAction(after)
        if (ver !== null) setVerifyAfterDownload(ver === '1' || ver === 'true')
        if (rem !== null) setRemoveTemporaryFiles(rem === '1' || rem === 'true')
        if (speed !== null) setDownloadSpeedLimit(bpsToSpeedKey(speed))
        if (dis) {
          try {
            const arr = JSON.parse(dis) as unknown
            if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
              setDisabledSourceIds(arr)
            }
          } catch {
            // ignora JSON inválido
          }
        }
      } catch {
        // Tauri indisponível (ex.: dev no browser)
      }
    })()

    let unlistenExtract: (() => void) | undefined
    let unlistenJob: (() => void) | undefined
    void tauriClient.listenExtractStatus((event) => {
      dispatch(extractStatusReceived(event))
      const job = store.getState().queue.jobs.find((row) => row.id === event.jobId)
      if (job) {
        void refreshPathState(job.title, job.destPath, job.id)
      }
    }).then((fn) => {
      unlistenExtract = fn
    })
    void tauriClient.listenJobProgress((event) => {
      dispatch(jobProgressReceived(event))
    }).then((fn) => {
      unlistenJob = fn
    })

    return () => {
      unlistenExtract?.()
      unlistenJob?.()
    }
  }, [dispatch, refreshPathState])

  useEffect(() => {
    if (activeTab !== 'library') return
    refreshLibraryScan()
    void dispatch(fetchJobs())
  }, [activeTab, dispatch, refreshLibraryScan])

  useEffect(() => {
    if (!defaultDownloadPath.trim()) return
    refreshLibraryScan()
  }, [defaultDownloadPath, refreshLibraryScan])

  const needsFastJobPolling = jobs.some(
    (job) =>
      job.status === 'downloading' ||
      job.status === 'pending' ||
      job.status === 'retrying',
  )

  useEffect(() => {
    if (activeTab !== 'downloads' && activeTab !== 'library' && !needsFastJobPolling) return

    const intervalMs =
      activeTab === 'downloads' ? 2500 : needsFastJobPolling ? 4000 : 12000
    const polling = window.setInterval(() => {
      void dispatch(fetchJobs())
    }, intervalMs)
    return () => window.clearInterval(polling)
  }, [dispatch, activeTab, needsFastJobPolling])

  useEffect(() => {
    if (activeTab !== 'settings') return
    let cancelled = false
    const run = async () => {
      const p = defaultDownloadPath.trim()
      if (!p) {
        if (!cancelled) setDiskFreeBytes(null)
        return
      }
      const bytes = await sourcesApi.getDiskFreeBytesForPath(p)
      if (!cancelled) setDiskFreeBytes(bytes)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, defaultDownloadPath])

  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string>('')
  const [downloadNow, setDownloadNow] = useState(() => Date.now())

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

  const metadataJobSignature = jobs
    .filter((job) => isTorrentMetadataPhase(job))
    .map((job) => job.id)
    .join('|')

  useEffect(() => {
    if (!metadataJobSignature) return
    const timer = window.setInterval(() => setDownloadNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [metadataJobSignature])

  const isSourceEnabled = (sourceId: string) => !disabledSourceIds.includes(sourceId)

  const enabledSourcesCount = useMemo(
    () => sources.filter((source) => !disabledSourceIds.includes(source.id)).length,
    [sources, disabledSourceIds],
  )

  const {
    resolveCover,
    warmCover,
    warmCovers,
    refreshCovers,
    syncJobCovers,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  } = useGameCovers(catalogGames)

  useEffect(() => {
    const items = catalogGames
      .filter((game) => game.coverUrl?.trim())
      .map((game) => ({ title: game.title, coverUrl: game.coverUrl!.trim() }))
    if (items.length > 0) warmCovers(items)
  }, [catalogGames, warmCovers])

  const displayCatalogSource = useMemo(() => {
    const q = discoverSearch.trim()
    if (q.length < 2) return []
    return catalogGames
  }, [catalogGames, discoverSearch])

  useEffect(() => {
    syncJobCovers(jobs)
  }, [jobs, syncJobCovers])

  useEffect(() => {
    let cancelled = false
    const query = discoverSearch.trim()
    if (query.length < 2) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogError('')
      return
    }

    if (enabledSourcesCount === 0) {
      setCatalogGames([])
      setCatalogLoading(false)
      setCatalogError('')
      return
    }

    const timer = window.setTimeout(() => {
      setCatalogLoading(true)
      void (async () => {
        try {
          const rows = await sourcesApi.searchGameCatalog({
            query: discoverSearch,
            includeSteam: false,
            onlyWithSources: true,
          })
          if (!cancelled) {
            setCatalogGames(rows)
            setCatalogError('')
          }
        } catch (error) {
          if (!cancelled) {
            setCatalogError(
              error instanceof Error
                ? error.message
                : 'Falha ao pesquisar nas fontes. Tente novamente.',
            )
          }
        } finally {
          if (!cancelled) setCatalogLoading(false)
        }
      })()
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [discoverSearch, enabledSourcesCount])

  useEffect(() => {
    if (activeTab !== 'library' && activeTab !== 'downloads') return

    let cancelled = false

    const loadQueue = async (attempt = 0) => {
      if (activeTab === 'downloads') setDownloadsBooting(true)
      const result = await dispatch(fetchJobs())
      if (cancelled) return

      const shouldRetry =
        activeTab === 'downloads' &&
        fetchJobs.rejected.match(result) &&
        attempt < 8 &&
        (result.error.message?.includes('sidecar') ||
          result.error.message?.includes('download-engine'))

      if (shouldRetry) {
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        return loadQueue(attempt + 1)
      }

      if (activeTab === 'downloads') setDownloadsBooting(false)

      if (activeTab === 'library') {
        refreshLibraryScan()
      }
    }

    void loadQueue()

    return () => {
      cancelled = true
      setDownloadsBooting(false)
    }
  }, [activeTab, dispatch, refreshLibraryScan])

  const closeDiscoverPicker = useCallback(() => {
    setDiscoverPickGame(null)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(false)
  }, [])

  const openDiscoverPicker = useCallback((game: CatalogGame) => {
    setDiscoverError('')
    setDiscoverPickGame(game)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(true)

    void (async () => {
      if (enabledSourcesCount === 0) {
        setDiscoverPickError(
          'Nenhuma fonte ativa. Ative pelo menos uma fonte (ex.: FitGirl) em Configurações.',
        )
        setDiscoverPickLoading(false)
        return
      }

      const hasPath =
        defaultDownloadPath.trim().length > 0 || (await sourcesApi.getDefaultDownloadPath())
      if (!hasPath) {
        setDiscoverPickError(
          'Defina a pasta de downloads em Configurações antes de baixar.',
        )
        setDiscoverPickLoading(false)
        return
      }

      try {
        const rows = await sourcesApi.searchDownloadOptions({
          query: buildSourceSearchQuery(game.title),
        })
        const downloadable = rows.filter(isDownloadableOption)
        setDiscoverPickOptions(downloadable)
        if (downloadable.length === 0) {
          setDiscoverPickError(
            rows.length > 0
              ? 'Foram encontradas páginas, mas sem torrents válidos. Tente outro jogo ou fonte.'
              : 'Nenhum torrent encontrado para este título. Verifique se a fonte FitGirl está ativa.',
          )
        }
      } catch {
        setDiscoverPickOptions([])
        setDiscoverPickError('Não foi possível consultar as fontes. Verifique a ligação e tente de novo.')
      } finally {
        setDiscoverPickLoading(false)
      }
    })()
  }, [defaultDownloadPath, enabledSourcesCount])

  useEffect(() => {
    if (!discoverPickGame) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiscoverPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [discoverPickGame, closeDiscoverPicker])

  useEffect(() => {
    if (!discoverPickGame?.coverUrl) return
    warmCover(discoverPickGame.title, discoverPickGame.coverUrl)
  }, [discoverPickGame, warmCover])

  const canSubmitSource = useMemo(() => sourceUrl.trim().length > 0, [sourceUrl])

  const isLibraryInstalled = (item: LibraryEntry) =>
    isPlayableLibraryItem(item, jobs, pathStateByKey)

  const handlePickGameInstallFolder = async (
    title: string,
    destPath: string,
    busyKey: string,
    jobId?: string,
  ) => {
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
          'Pasta guardada, mas ainda não encontrámos o executável. Verifique se escolheu a pasta certa.',
        )
      }
    } catch (error) {
      setSavePathError(
        error instanceof Error ? error.message : 'Não foi possível guardar a pasta de instalação.',
      )
    } finally {
      setInstallBusyId(null)
    }
  }

  const handlePlayLibraryItem = async (item: LibraryEntry) => {
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
      setActionMessage(`A iniciar ${name}…`)
    } catch (launchError) {
      setSavePathError(formatLaunchError(launchError))
    } finally {
      setPlayBusyId(null)
    }
  }

  const handleInstallItem = async (item: LibraryEntry) => {
    setSavePathError('')
    setActionMessage('A abrir instalador…')
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
  }


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
    }, 500)
    return () => window.clearTimeout(timer)
  }, [activeTab, libraryItems, lookupMissingLibraryCover])

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmitSource) return
    void dispatch(addSource({ url: sourceUrl.trim() }))
    setSourceUrl('')
  }

  const handleSaveInstallSettings = async () => {
    const path = defaultDownloadPath.trim()
    if (!path) {
      setSavePathError('Indique uma pasta de destino.')
      return
    }
    setSavePathError('')
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      await sourcesApi.setAppSetting(SETTING_KEY.installOrganization, installOrganization)
      await sourcesApi.setAppSetting(SETTING_KEY.afterInstallAction, afterInstallAction)
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao salvar definições de instalação.')
    }
  }

  const handleToggleVerify = async (next: boolean) => {
    setVerifyAfterDownload(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.verifyAfterDownload, next ? '1' : '0')
    } catch (error) {
      setVerifyAfterDownload((v) => !v)
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar verificação.')
    }
  }

  const handleToggleRemoveTemp = async (next: boolean) => {
    setRemoveTemporaryFiles(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0')
    } catch (error) {
      setRemoveTemporaryFiles((v) => !v)
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar opção de ficheiros temporários.')
    }
  }

  const handleSpeedLimitChange = async (value: string) => {
    setDownloadSpeedLimit(value)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.downloadSpeedLimitBps, String(speedKeyToBps(value)))
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar limite de velocidade.')
    }
  }

  const handleToggleSource = (sourceId: string) => {
    setDisabledSourceIds((prev) => {
      const isDisabled = prev.includes(sourceId)
      const next = isDisabled ? prev.filter((x) => x !== sourceId) : [...prev, sourceId]
      void sourcesApi
        .setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next))
        .catch((error) => {
          setSavePathError(
            error instanceof Error ? error.message : 'Falha ao guardar fontes ativas.',
          )
        })
      return next
    })
  }

  const handleEnqueueFromDiscover = async (title: string, url: string, coverUrl?: string | null) => {
    setDiscoverError('')
    setDiscoverBusy(url)
    try {
      const hasPath = defaultDownloadPath.trim().length > 0
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!hasPath && !fromDb) {
        setDiscoverError('Defina a pasta padrão em Configurações antes de baixar.')
        return
      }
      const destPath = defaultDownloadPath.trim() || fromDb || undefined
      const resolvedCover = coverUrl ?? discoverPickGame?.coverUrl ?? null
      await dispatch(
        enqueueJob({
          title,
          url,
          destPath: destPath ?? undefined,
          coverUrl: resolvedCover ?? undefined,
        }),
      ).unwrap()
      if (resolvedCover) refreshCovers()
      closeDiscoverPicker()
      setActiveTab('downloads')
    } catch (error) {
      setDiscoverError(
        error instanceof Error ? error.message : 'Falha ao adicionar o download à fila.',
      )
    } finally {
      setDiscoverBusy(null)
    }
  }

  const handleSelectDefaultPath = async () => {
    setSavePathError('')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Selecione a pasta padrão de downloads',
      defaultPath: defaultDownloadPath || undefined,
    })
    if (typeof selected === 'string') {
      setDefaultDownloadPath(selected)
      try {
        await sourcesApi.setDefaultDownloadPath(selected)
      } catch {
        setSavePathError('Nao foi possivel salvar a pasta. Execute com "npm run tauri:dev".')
      }
    }
  }

  const handleToggleSeed = async (enabled: boolean) => {
    setSeedTorrentsEnabled(enabled)
    try {
      await sourcesApi.setSeedTorrentsEnabled(enabled)
    } catch (error) {
      setSeedTorrentsEnabled((prev) => !prev)
      setSavePathError(
        error instanceof Error ? error.message : 'Falha ao salvar preferência de semeadura.',
      )
    }
  }

  const formatSpeed = (speedBytesPerSec?: number) => {
    const speed = speedBytesPerSec ?? 0
    if (speed >= 1024 * 1024) return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
    if (speed >= 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${speed} B/s`
  }

  const formatSize = (bytes?: number) => {
    const value = bytes ?? 0
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${value} B`
  }

  const formatEta = (seconds?: number) => {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
    if (seconds > 86400 * 2) return null
    const s = Math.floor(seconds)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return `${h} h ${m % 60} min`
  }

  const jobStatusLabel = (job: DownloadJob) => {
    if (isTorrentMetadataPhase(job)) return 'A ligar peers'
    switch (job.status) {
      case 'pending':
        return 'Na fila'
      case 'downloading':
        return 'A transferir'
      case 'seeding':
        return 'Download completo · a semear'
      case 'retrying':
        return 'A repetir'
      case 'paused':
        return 'Pausado'
      case 'completed':
        return 'Concluído'
      case 'extracting':
        return 'A processar'
      case 'extracted':
        return 'Instalado'
      case 'failed':
        return 'Falhou'
      case 'skipped':
        return 'Pronto'
      case 'cancelled':
        return 'Cancelado'
      default:
        return job.status
    }
  }

  const showEtaForJob = (job: DownloadJob) => {
    if (isTorrentMetadataPhase(job)) return false
    if (job.status !== 'downloading' && job.status !== 'retrying') return false
    const eta = job.etaSeconds
    return eta != null && Number.isFinite(eta) && eta > 0 && eta < 86400 * 2
  }

  const jobTransferDetail = (job: DownloadJob) => {
    if (isTorrentMetadataPhase(job)) {
      return metadataPhaseDetail(job, downloadNow)
    }
    const total = job.totalBytes > 0 ? formatSize(job.totalBytes) : 'tamanho desconhecido'
    return `${formatSize(job.bytesDownloaded)} / ${total}`
  }

  const handleDeleteLibraryItem = async (item: LibraryEntry) => {
    const confirmed = await ask(`Apagar "${item.title}" e os ficheiros na pasta de instalação?`, {
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
      setSavePathError(error instanceof Error ? error.message : 'Falha ao apagar item.')
      void dispatch(fetchJobs())
      const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => [] as LocalLibraryItem[])
      setLocalLibraryItems(scanned)
    }
  }

  const renderDiscover = () => (
    <DiscoverPage
      discoverSearch={discoverSearch}
      catalogLoading={catalogLoading}
      discoverError={discoverError}
      catalogError={catalogError}
      displayCatalogSource={displayCatalogSource}
      discoverPickGame={discoverPickGame}
      discoverPickLoading={discoverPickLoading}
      discoverPickError={discoverPickError}
      discoverPickOptions={discoverPickOptions}
      discoverBusy={discoverBusy}
      enabledSourcesCount={enabledSourcesCount}
      setDiscoverSearch={setDiscoverSearch}
      onGoSettings={() => setActiveTab('settings')}
      openDiscoverPicker={openDiscoverPicker}
      closeDiscoverPicker={closeDiscoverPicker}
      handleEnqueueFromDiscover={handleEnqueueFromDiscover}
      resolveCover={resolveCover}
      warmCover={warmCover}
      lookupCoverForTitle={lookupCoverForTitle}
      invalidateLocalCover={invalidateLocalCover}
    />
  )

  const renderDownloads = () => (
    <DownloadsPage
      jobs={jobs}
      queueLoading={queueLoading}
      queueError={queueError}
      downloadsBooting={downloadsBooting}
      savePathError={savePathError}
      actionMessage={actionMessage}
      isTorrentMetadataPhase={isTorrentMetadataPhase}
      resolveJobProgressPercent={resolveJobProgressPercent}
      formatProgressPercent={formatProgressPercent}
      formatSpeed={formatSpeed}
      formatEta={formatEta}
      jobStatusLabel={jobStatusLabel}
      showEtaForJob={showEtaForJob}
      jobTransferDetail={jobTransferDetail}
      onOpenFolder={queueApi.openJobFolder}
      onPauseJob={async (id) => {
        await dispatch(pauseJob(id))
      }}
      onResumeJob={async (id) => {
        await dispatch(resumeJob(id))
      }}
      onCancelJob={async (id) => {
        await dispatch(cancelJob(id))
      }}
      onClearCompleted={async () => {
        await dispatch(clearCompletedJobs())
      }}
      onPauseAll={async () => {
        const activeJobs = jobs.filter((job) => job.status !== 'cancelled')
        activeJobs.forEach((job) => {
          if (
            job.status === 'downloading' ||
            job.status === 'pending' ||
            job.status === 'retrying'
          ) {
            void dispatch(pauseJob(job.id))
          }
        })
      }}
      resolveCover={resolveCover}
      invalidateLocalCover={invalidateLocalCover}
    />
  )

  const renderLibrary = () => (
    <LibraryPage
      libraryItems={libraryItems}
      jobs={jobs}
      pathStateByKey={pathStateByKey}
      libraryFilter={libraryFilter}
      libraryStatusFilter={libraryStatusFilter}
      playBusyId={playBusyId}
      installBusyId={installBusyId}
      savePathError={savePathError}
      actionMessage={actionMessage}
      setLibraryFilter={setLibraryFilter}
      setLibraryStatusFilter={setLibraryStatusFilter}
      setActiveTabDownloads={() => setActiveTab('downloads')}
      onGoDiscover={() => setActiveTab('discover')}
      resolveCover={resolveCover}
      invalidateLocalCover={invalidateLocalCover}
      libraryStatusMeta={libraryStatusMeta}
      showPlayAction={showPlayAction}
      showInstallAction={showInstallAction}
      showLocateInstallAction={showLocateInstallAction}
      hasManualInstallRoot={hasManualInstallRoot}
      isLibraryInstalled={isLibraryInstalled}
      handlePlayLibraryItem={handlePlayLibraryItem}
      handleInstallItem={handleInstallItem}
      handlePickGameInstallFolder={handlePickGameInstallFolder}
      handleDeleteLibraryItem={handleDeleteLibraryItem}
      onResumeItem={async (id) => {
        await dispatch(resumeJob(id))
      }}
      onOpenLocalPath={sourcesApi.openLocalPath}
    />
  )

  const renderSettings = () => (
    <SettingsPage
      sourceUrl={sourceUrl}
      defaultDownloadPath={defaultDownloadPath}
      savePathError={savePathError}
      diskFreeBytes={diskFreeBytes}
      installOrganization={installOrganization}
      afterInstallAction={afterInstallAction}
      sources={sources}
      sourcesLoading={sourcesLoading}
      sourcesError={sourcesError}
      verifyAfterDownload={verifyAfterDownload}
      removeTemporaryFiles={removeTemporaryFiles}
      seedTorrentsEnabled={seedTorrentsEnabled}
      downloadSpeedLimit={downloadSpeedLimit}
      canSubmitSource={canSubmitSource}
      isSourceEnabled={isSourceEnabled}
      setSourceUrl={setSourceUrl}
      setDefaultDownloadPath={setDefaultDownloadPath}
      setInstallOrganization={setInstallOrganization}
      setAfterInstallAction={setAfterInstallAction}
      handleSelectDefaultPath={handleSelectDefaultPath}
      handleSaveInstallSettings={handleSaveInstallSettings}
      handleAddSource={handleAddSource}
      handleToggleSource={handleToggleSource}
      handleToggleVerify={handleToggleVerify}
      handleToggleRemoveTemp={handleToggleRemoveTemp}
      handleToggleSeed={handleToggleSeed}
      handleSpeedLimitChange={handleSpeedLimitChange}
      formatSize={formatSize}
    />
  )

  const renderMainContent = () => {
    switch (activeTab) {
      case 'discover':
        return renderDiscover()
      case 'library':
        return renderLibrary()
      case 'downloads':
        return renderDownloads()
      case 'settings':
        return renderSettings()
      default:
        return null
    }
  }

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {renderMainContent()}
    </AppShell>
  )
}

export default App
