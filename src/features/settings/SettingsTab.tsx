import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { APP_LOCALE, isAppLanguage, localeForLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import {
  addSource,
  deleteSource,
  fetchSources,
  syncAllSources,
  syncSource,
} from '../sources/sourcesSlice'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { SettingsPage } from './SettingsPage'
import { SETTING_KEY, speedKeyToBps } from '../../shared/config/appSettings'
import { HYDRALINKS_SITE_URL } from '../../shared/config/hydraLinks'
import { formatUserError } from '../../shared/utils/formatUserError'
import { notificationSoundOptions } from '../../shared/utils/notificationSound'
import { useToast } from '../../shared/components/ToastProvider'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useErrorToast } from '../../shared/hooks/useErrorToast'
import type { CoverPrecacheStatus } from '../../shared/types/contracts'

export function SettingsTab() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const {
    defaultDownloadPath,
    setDefaultDownloadPath,
    installOrganization,
    setInstallOrganization,
    afterInstallAction,
    setAfterInstallAction,
    removeTemporaryFiles,
    setRemoveTemporaryFiles,
    seedTorrentsEnabled,
    setSeedTorrentsEnabled,
    downloadSpeedLimit,
    setDownloadSpeedLimit,
    disabledSourceIds,
    setDisabledSourceIds,
    disabledSourcesReady,
    notifyReadyToInstall,
    setNotifyReadyToInstall,
    notifyReadyToPlay,
    setNotifyReadyToPlay,
    notifyCatalogChanges,
    setNotifyCatalogChanges,
    notifySound,
    setNotifySound,
  } = useAppSettings()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)

  const [addingSource, setAddingSource] = useState(false)
  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
  const [syncingAllSources, setSyncingAllSources] = useState(false)
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [coverPrecacheStatus, setCoverPrecacheStatus] = useState<CoverPrecacheStatus | null>(null)
  const [coverPrecacheBusy, setCoverPrecacheBusy] = useState(false)
  const { showError, showSuccess } = useToast()

  useErrorToast(sourcesError, t('settings.toastSourcesLoadError'))

  useEffect(() => {
    let cancelled = false
    void sourcesApi
      .getAppSetting(SETTING_KEY.minimizeToTray)
      .then((value) => {
        if (!cancelled) {
          setMinimizeToTray(value === '1' || value === 'true')
        }
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    void sourcesApi
      .getCoverPrecacheStatus()
      .then((status) => {
        if (!cancelled) setCoverPrecacheStatus(status)
      })
      .catch(() => {
        /* ignore */
      })

    void listen<CoverPrecacheStatus>('cover-precache-progress', (event) => {
      if (!cancelled) setCoverPrecacheStatus(event.payload)
    }).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten = fn
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
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
  }, [defaultDownloadPath])

  const handleAddSourceByUrl = async () => {
    if (addingSource) return
    const url = sourceUrlInput.trim()
    if (!url) {
      showError(t('settings.toastPasteUrl'))
      return
    }

    setAddingSource(true)
    try {
      const source = await dispatch(addSource({ url })).unwrap()
      setSourceUrlInput('')
      showSuccess(
        t('settings.toastGamesAdded', {
          count: source.downloadCount.toLocaleString(
            localeForLanguage(isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE),
          ),
        }),
      )
    } catch (error) {
      showError(formatUserError(error, t('settings.toastAddSourceError')))
    } finally {
      setAddingSource(false)
    }
  }

  const handleImportSource = async () => {
    if (addingSource) return
    const selected = await open({
      multiple: false,
      filters: [{ name: t('settings.jsonCatalogFilter'), extensions: ['json'] }],
    })
    if (typeof selected !== 'string' || !selected.toLowerCase().endsWith('.json')) return

    setAddingSource(true)
    try {
      const source = await dispatch(addSource({ url: selected.trim() })).unwrap()
      showSuccess(
        t('settings.toastGamesImported', {
          count: source.downloadCount.toLocaleString(
            localeForLanguage(isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE),
          ),
        }),
      )
    } catch (error) {
      showError(formatUserError(error, t('settings.toastImportError')))
    } finally {
      setAddingSource(false)
    }
  }

  const handleDeleteSource = useCallback((sourceId: string, sourceName: string) => {
    setPendingDelete({ id: sourceId, name: sourceName })
  }, [])

  const handleCancelDeleteSource = useCallback(() => {
    if (deletingSourceId) return
    setPendingDelete(null)
  }, [deletingSourceId])

  const handleConfirmDeleteSource = useCallback(async () => {
    if (!pendingDelete || deletingSourceId) return
    const { id: sourceId } = pendingDelete
    setDeletingSourceId(sourceId)
    try {
      await dispatch(deleteSource(sourceId)).unwrap()
      const next = disabledSourceIds.filter((id) => id !== sourceId)
      setDisabledSourceIds(next)
      try {
        await sourcesApi.setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next))
      } catch (error) {
        showError(formatUserError(error, t('settings.toastSourcesSaveError')))
      }
      setPendingDelete(null)
    } finally {
      setDeletingSourceId(null)
    }
  }, [
    pendingDelete,
    deletingSourceId,
    dispatch,
    disabledSourceIds,
    setDisabledSourceIds,
    showError,
    t,
  ])

  const handleSyncSource = async (sourceId: string, sourceName: string) => {
    if (syncingSourceId === sourceId || syncingAllSources) return
    if (syncingSourceId !== null) return
    setSyncingSourceId(sourceId)
    try {
      await dispatch(syncSource(sourceId)).unwrap()
      showSuccess(t('settings.toastSourceUpdated', { name: sourceName }))
    } finally {
      setSyncingSourceId(null)
    }
  }

  const handleSyncAllSources = async () => {
    if (sources.length === 0 || syncingAllSources) return
    if (syncingSourceId !== null) return
    setSyncingAllSources(true)
    try {
      await dispatch(syncAllSources()).unwrap()
      showSuccess(t('settings.toastAllUpdated'))
      await dispatch(fetchSources())
    } finally {
      setSyncingAllSources(false)
    }
  }

  const handleOpenCatalogsFolder = async () => {
    try {
      await sourcesApi.openCatalogsCacheFolder()
    } catch (error) {
      showError(formatUserError(error, t('settings.toastOpenCatalogsError')))
    }
  }

  const handleOpenHydraLinksSite = async () => {
    try {
      await sourcesApi.openExternalUrl(HYDRALINKS_SITE_URL)
    } catch (error) {
      showError(formatUserError(error, t('settings.toastOpenHydraLinksError')))
    }
  }

  const handleSaveInstallSettings = async () => {
    const path = defaultDownloadPath.trim()
    if (!path) {
      showError(t('settings.toastDestinationRequired'))
      return
    }
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      await sourcesApi.setAppSetting(SETTING_KEY.installOrganization, installOrganization)
      await sourcesApi.setAppSetting(SETTING_KEY.afterInstallAction, afterInstallAction)
      const bytes = await sourcesApi.getDiskFreeBytesForPath(path)
      setDiskFreeBytes(bytes)
    } catch (error) {
      showError(formatUserError(error, t('settings.toastInstallSaveError')))
    }
  }

  const handleSelectDefaultPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('settings.toastSelectPathTitle'),
      defaultPath: defaultDownloadPath || undefined,
    })
    if (typeof selected === 'string') {
      setDefaultDownloadPath(selected)
      try {
        await sourcesApi.setDefaultDownloadPath(selected)
        const bytes = await sourcesApi.getDiskFreeBytesForPath(selected)
        setDiskFreeBytes(bytes)
      } catch {
        showError(t('settings.toastSavePathError'))
      }
    }
  }

  const handleToggleRemoveTemp = async (next: boolean) => {
    setRemoveTemporaryFiles(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0')
    } catch (error) {
      setRemoveTemporaryFiles(!next)
      showError(formatUserError(error, t('settings.toastTempSaveError')))
    }
  }

  const handleSpeedLimitChange = async (value: string) => {
    setDownloadSpeedLimit(value)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.downloadSpeedLimitBps, String(speedKeyToBps(value)))
    } catch (error) {
      showError(formatUserError(error, t('settings.toastSpeedSaveError')))
    }
  }

  const handleToggleSeed = async (enabled: boolean) => {
    setSeedTorrentsEnabled(enabled)
    try {
      await sourcesApi.setSeedTorrentsEnabled(enabled)
    } catch (error) {
      setSeedTorrentsEnabled(!enabled)
      showError(formatUserError(error, t('settings.toastSeedSaveError')))
    }
  }

  const handleToggleMinimizeToTray = async (enabled: boolean) => {
    setMinimizeToTray(enabled)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.minimizeToTray, enabled ? '1' : '0')
    } catch (error) {
      setMinimizeToTray(!enabled)
      showError(formatUserError(error, t('settings.toastTraySaveError')))
    }
  }

  const persistNotifyFlag = useCallback(
    async (
      key: string,
      next: boolean,
      apply: (v: boolean) => void,
      revert: boolean,
    ) => {
      apply(next)
      try {
        await sourcesApi.setAppSetting(key, next ? '1' : '0')
      } catch (error) {
        apply(revert)
        showError(formatUserError(error, t('settings.toastNotifySaveError')))
      }
    },
    [showError, t],
  )

  const handleToggleNotifyReadyToInstall = (enabled: boolean) =>
    persistNotifyFlag(
      SETTING_KEY.notifyReadyToInstall,
      enabled,
      setNotifyReadyToInstall,
      notifyReadyToInstall,
    )

  const handleToggleNotifyReadyToPlay = (enabled: boolean) =>
    persistNotifyFlag(
      SETTING_KEY.notifyReadyToPlay,
      enabled,
      setNotifyReadyToPlay,
      notifyReadyToPlay,
    )

  const handleToggleNotifyCatalogChanges = (enabled: boolean) =>
    persistNotifyFlag(
      SETTING_KEY.notifyCatalogChanges,
      enabled,
      setNotifyCatalogChanges,
      notifyCatalogChanges,
    )

  const handleToggleNotifySound = (enabled: boolean) =>
    persistNotifyFlag(SETTING_KEY.notifySound, enabled, setNotifySound, notifySound)

  const [notifyTestBusy, setNotifyTestBusy] = useState(false)

  const handleTestNotification = async () => {
    setNotifyTestBusy(true)
    try {
      let granted = await isPermissionGranted()
      if (!granted) {
        granted = (await requestPermission()) === 'granted'
      }
      if (!granted) {
        showError(t('settings.notifyTestPermissionError'))
        return
      }
      await sendNotification({
        title: t('settings.notifyTestTitle'),
        body: t('settings.notifyTestBody'),
        ...notificationSoundOptions(notifySound),
      })
    } catch (error) {
      showError(formatUserError(error, t('settings.notifyTestError')))
    } finally {
      setNotifyTestBusy(false)
    }
  }

  const handleStartCoverPrecache = async () => {
    setCoverPrecacheBusy(true)
    try {
      const status = await sourcesApi.startCoverPrecache()
      setCoverPrecacheStatus(status)
    } catch (error) {
      showError(formatUserError(error, t('settings.toastCoversError')))
    } finally {
      setCoverPrecacheBusy(false)
    }
  }

  const handleStopCoverPrecache = async () => {
    setCoverPrecacheBusy(true)
    try {
      const status = await sourcesApi.stopCoverPrecache()
      setCoverPrecacheStatus(status)
    } catch (error) {
      showError(formatUserError(error, t('settings.toastCoversError')))
    } finally {
      setCoverPrecacheBusy(false)
    }
  }

  const handleRetryUnresolvedCovers = async () => {
    setCoverPrecacheBusy(true)
    try {
      const status = await sourcesApi.retryUnresolvedCovers()
      setCoverPrecacheStatus(status)
    } catch (error) {
      showError(formatUserError(error, t('settings.toastCoversError')))
    } finally {
      setCoverPrecacheBusy(false)
    }
  }

  const handleToggleSourceEnabled = useCallback(
    async (sourceId: string, enable: boolean) => {
      if (!disabledSourcesReady) return
      const previous = disabledSourceIds
      const next = enable
        ? disabledSourceIds.filter((id) => id !== sourceId)
        : disabledSourceIds.includes(sourceId)
          ? disabledSourceIds
          : [...disabledSourceIds, sourceId]
      setDisabledSourceIds(next)
      try {
        await sourcesApi.setAppSetting(
          SETTING_KEY.disabledHydraSourceIds,
          JSON.stringify(next),
        )
      } catch (error) {
        setDisabledSourceIds(previous)
        showError(formatUserError(error, t('settings.toastSourcesSaveError')))
      }
    },
    [
      disabledSourceIds,
      disabledSourcesReady,
      setDisabledSourceIds,
      showError,
      t,
    ],
  )

  return (
    <>
      <SettingsPage
        defaultDownloadPath={defaultDownloadPath}
        diskFreeBytes={diskFreeBytes}
        installOrganization={installOrganization}
        afterInstallAction={afterInstallAction}
        sources={sources}
        sourcesLoading={sourcesLoading}
        removeTemporaryFiles={removeTemporaryFiles}
        seedTorrentsEnabled={seedTorrentsEnabled}
        downloadSpeedLimit={downloadSpeedLimit}
        addingSource={addingSource}
        sourceUrlInput={sourceUrlInput}
        setSourceUrlInput={setSourceUrlInput}
        setDefaultDownloadPath={setDefaultDownloadPath}
        setInstallOrganization={setInstallOrganization}
        setAfterInstallAction={setAfterInstallAction}
        handleSelectDefaultPath={handleSelectDefaultPath}
        handleSaveInstallSettings={handleSaveInstallSettings}
        onOpenCatalogsFolder={handleOpenCatalogsFolder}
        onAddSourceByUrl={handleAddSourceByUrl}
        onImportSource={handleImportSource}
        onOpenHydraLinksSite={handleOpenHydraLinksSite}
        onDeleteSource={handleDeleteSource}
        onSyncSource={handleSyncSource}
        onSyncAllSources={handleSyncAllSources}
        onToggleSourceEnabled={handleToggleSourceEnabled}
        disabledSourceIds={disabledSourceIds}
        disabledSourcesReady={disabledSourcesReady}
        deletingSourceId={deletingSourceId}
        syncingSourceId={syncingSourceId}
        syncingAllSources={syncingAllSources}
        handleToggleRemoveTemp={handleToggleRemoveTemp}
        handleToggleSeed={handleToggleSeed}
        handleSpeedLimitChange={handleSpeedLimitChange}
        minimizeToTray={minimizeToTray}
        handleToggleMinimizeToTray={handleToggleMinimizeToTray}
        notifyReadyToInstall={notifyReadyToInstall}
        notifyReadyToPlay={notifyReadyToPlay}
        notifyCatalogChanges={notifyCatalogChanges}
        notifySound={notifySound}
        handleToggleNotifyReadyToInstall={handleToggleNotifyReadyToInstall}
        handleToggleNotifyReadyToPlay={handleToggleNotifyReadyToPlay}
        handleToggleNotifyCatalogChanges={handleToggleNotifyCatalogChanges}
        handleToggleNotifySound={handleToggleNotifySound}
        handleTestNotification={handleTestNotification}
        notifyTestBusy={notifyTestBusy}
        coverPrecacheStatus={coverPrecacheStatus}
        coverPrecacheBusy={coverPrecacheBusy}
        onStartCoverPrecache={handleStartCoverPrecache}
        onStopCoverPrecache={handleStopCoverPrecache}
        onRetryUnresolvedCovers={handleRetryUnresolvedCovers}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('settings.deleteSourceTitle')}
        description={
          pendingDelete
            ? t('settings.deleteSourceConfirm', { name: pendingDelete.name })
            : ''
        }
        confirmLabel={
          deletingSourceId ? t('settings.deleting') : t('common.delete')
        }
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        busy={deletingSourceId !== null}
        onConfirm={() => void handleConfirmDeleteSource()}
        onCancel={handleCancelDeleteSource}
      />
    </>
  )
}
