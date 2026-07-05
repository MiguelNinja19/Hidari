import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { useAppBootstrap } from './app/hooks/useAppBootstrap'
import { useJobPolling } from './app/hooks/useJobPolling'
import { addSource } from './features/sources/sourcesSlice'
import {
  enqueueJob,
  pauseJob,
  resumeJob,
  cancelJob,
  clearCompletedJobs,
} from './features/queue/queueSlice'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import { useGameCovers } from './features/covers/useGameCovers'
import { AppShell } from './layout/AppShell'
import type { NavTab } from './layout/types'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { useDiscoverCatalog } from './features/discover/useDiscoverCatalog'
import { DownloadsPage } from './features/downloads/DownloadsPage'
import { LibraryPage } from './features/library/LibraryPage'
import { LibraryControllerProvider } from './features/library/LibraryController'
import { useLibraryControllerState } from './features/library/useLibraryControllerState'
import { SettingsPage } from './features/settings/SettingsPage'
import {
  AFTER_INSTALL_ACTION_DEFAULT,
  INSTALL_ORGANIZATION_DEFAULT,
  SETTING_KEY,
  speedKeyToBps,
} from './shared/config/appSettings'
import {
  formatSize,
} from './shared/utils/formatters'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
} from './shared/utils/jobProgress'
import './App.css'

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)

  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [sourceUrl, setSourceUrl] = useState('')
  const [discoverSearch, setDiscoverSearch] = useState('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('')
  const [savePathError, setSavePathError] = useState('')
  const [downloadsBooting, setDownloadsBooting] = useState(false)
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState(true)
  const [verifyAfterDownload, setVerifyAfterDownload] = useState(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState('ilimitado')
  const [installOrganization, setInstallOrganization] = useState(INSTALL_ORGANIZATION_DEFAULT)
  const [afterInstallAction, setAfterInstallAction] = useState(AFTER_INSTALL_ACTION_DEFAULT)
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)
  const [downloadNow, setDownloadNow] = useState(() => Date.now())

  const isSourceEnabled = (sourceId: string) => !disabledSourceIds.includes(sourceId)
  const enabledSourcesCount = useMemo(
    () => sources.filter((source) => !disabledSourceIds.includes(source.id)).length,
    [sources, disabledSourceIds],
  )

  useAppBootstrap({
    setDefaultDownloadPath,
    setSeedTorrentsEnabled,
    setInstallOrganization,
    setAfterInstallAction,
    setVerifyAfterDownload,
    setRemoveTemporaryFiles,
    setDownloadSpeedLimit,
    setDisabledSourceIds,
  })

  const discover = useDiscoverCatalog({
    discoverSearch,
    enabledSourcesCount,
    defaultDownloadPath,
  })

  const {
    resolveCover,
    warmCover,
    warmCovers,
    refreshCovers,
    syncJobCovers,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  } = useGameCovers(discover.catalogGames)

  const libraryController = useLibraryControllerState({
    activeTab,
    jobs,
    defaultDownloadPath,
    dispatch,
    onGoDiscover: () => setActiveTab('discover'),
    onGoDownloads: () => setActiveTab('downloads'),
    resolveCover,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  })

  useJobPolling({
    activeTab,
    jobs,
    setDownloadsBooting,
  })

  useEffect(() => {
    syncJobCovers(jobs)
  }, [jobs, syncJobCovers])

  useEffect(() => {
    const items = discover.catalogGames
      .filter((game) => game.coverUrl?.trim())
      .map((game) => ({ title: game.title, coverUrl: game.coverUrl!.trim() }))
    if (items.length > 0) warmCovers(items)
  }, [discover.catalogGames, warmCovers])

  useEffect(() => {
    if (!discover.discoverPickGame?.coverUrl) return
    warmCover(discover.discoverPickGame.title, discover.discoverPickGame.coverUrl)
  }, [discover.discoverPickGame, warmCover])

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

  const metadataJobSignature = jobs
    .filter((job) => isTorrentMetadataPhase(job))
    .map((job) => job.id)
    .join('|')

  useEffect(() => {
    if (!metadataJobSignature) return
    const timer = window.setInterval(() => setDownloadNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [metadataJobSignature])

  const canSubmitSource = sourceUrl.trim().length > 0

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
      setSavePathError(
        error instanceof Error ? error.message : 'Falha ao salvar configurações de instalação.',
      )
    }
  }

  const handleToggleVerify = async (next: boolean) => {
    setVerifyAfterDownload(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.verifyAfterDownload, next ? '1' : '0')
    } catch (error) {
      setVerifyAfterDownload((v) => !v)
      setSavePathError(error instanceof Error ? error.message : 'Falha ao salvar verificação.')
    }
  }

  const handleToggleRemoveTemp = async (next: boolean) => {
    setRemoveTemporaryFiles(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0')
    } catch (error) {
      setRemoveTemporaryFiles((v) => !v)
      setSavePathError(
        error instanceof Error ? error.message : 'Falha ao salvar opção de arquivos temporários.',
      )
    }
  }

  const handleSpeedLimitChange = async (value: string) => {
    setDownloadSpeedLimit(value)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.downloadSpeedLimitBps, String(speedKeyToBps(value)))
    } catch (error) {
      setSavePathError(
        error instanceof Error ? error.message : 'Falha ao salvar limite de velocidade.',
      )
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
            error instanceof Error ? error.message : 'Falha ao salvar fontes ativas.',
          )
        })
      return next
    })
  }

  const handleEnqueueFromDiscover = async (
    title: string,
    url: string,
    coverUrl?: string | null,
  ) => {
    discover.setDiscoverError('')
    discover.setDiscoverBusy(url)
    try {
      const hasPath = defaultDownloadPath.trim().length > 0
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!hasPath && !fromDb) {
        discover.setDiscoverError('Defina a pasta padrão em Configurações antes de baixar.')
        return
      }
      const destPath = defaultDownloadPath.trim() || fromDb || undefined
      const resolvedCover = coverUrl ?? discover.discoverPickGame?.coverUrl ?? null
      await dispatch(
        enqueueJob({
          title,
          url,
          destPath: destPath ?? undefined,
          coverUrl: resolvedCover ?? undefined,
        }),
      ).unwrap()
      if (resolvedCover) refreshCovers()
      discover.closeDiscoverPicker()
      setActiveTab('downloads')
    } catch (error) {
      discover.setDiscoverError(
        error instanceof Error ? error.message : 'Falha ao adicionar o download à fila.',
      )
    } finally {
      discover.setDiscoverBusy(null)
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

  const renderMainContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <DiscoverPage
            discoverSearch={discoverSearch}
            catalogLoading={discover.catalogLoading}
            discoverError={discover.discoverError}
            catalogError={discover.catalogError}
            displayCatalogSource={discover.displayCatalogSource}
            discoverPickGame={discover.discoverPickGame}
            discoverPickLoading={discover.discoverPickLoading}
            discoverPickError={discover.discoverPickError}
            discoverPickOptions={discover.discoverPickOptions}
            discoverBusy={discover.discoverBusy}
            enabledSourcesCount={enabledSourcesCount}
            sources={sources}
            sourcesLoading={sourcesLoading}
            isSourceEnabled={isSourceEnabled}
            setDiscoverSearch={setDiscoverSearch}
            onGoSettings={() => setActiveTab('settings')}
            openDiscoverPicker={discover.openDiscoverPicker}
            closeDiscoverPicker={discover.closeDiscoverPicker}
            handleEnqueueFromDiscover={handleEnqueueFromDiscover}
            resolveCover={resolveCover}
            warmCover={warmCover}
            lookupCoverForTitle={lookupCoverForTitle}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'library':
        return (
          <LibraryControllerProvider value={libraryController}>
            <LibraryPage />
          </LibraryControllerProvider>
        )
      case 'downloads':
        return (
          <DownloadsPage
            jobs={jobs}
            queueLoading={queueLoading}
            queueError={queueError}
            downloadsBooting={downloadsBooting}
            savePathError={savePathError}
            isTorrentMetadataPhase={isTorrentMetadataPhase}
            resolveJobProgressPercent={resolveJobProgressPercent}
            formatProgressPercent={formatProgressPercent}
            downloadNow={downloadNow}
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
              jobs
                .filter((job) => job.status !== 'cancelled')
                .forEach((job) => {
                  if (
                    job.status === 'downloading' ||
                    job.status === 'pending' ||
                    job.status === 'retrying'
                  ) {
                    void dispatch(pauseJob(job.id))
                  }
                })
            }}
            onGoDiscover={() => setActiveTab('discover')}
            resolveCover={resolveCover}
            invalidateLocalCover={invalidateLocalCover}
          />
        )
      case 'settings':
        return (
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
