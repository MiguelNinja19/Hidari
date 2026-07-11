import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
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
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useErrorToast } from '../../shared/hooks/useErrorToast'

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
  const { showError, showSuccess } = useToast()

  useErrorToast(sourcesError, t('settings.toastSourcesLoadError'))

  const isSourceEnabled = (sourceId: string) => !disabledSourceIds.includes(sourceId)

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

  const handleToggleSource = async (sourceId: string) => {
    if (!disabledSourcesReady) return
    const previous = disabledSourceIds
    const isDisabled = previous.includes(sourceId)
    const next = isDisabled
      ? previous.filter((x) => x !== sourceId)
      : [...previous, sourceId]
    setDisabledSourceIds(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next))
    } catch (error) {
      setDisabledSourceIds(previous)
      showError(formatUserError(error, t('settings.toastSourcesSaveError')))
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
        onAddSourceByUrl={handleAddSourceByUrl}
        isSourceEnabled={isSourceEnabled}
        setDefaultDownloadPath={setDefaultDownloadPath}
        setInstallOrganization={setInstallOrganization}
        setAfterInstallAction={setAfterInstallAction}
        handleSelectDefaultPath={handleSelectDefaultPath}
        handleSaveInstallSettings={handleSaveInstallSettings}
        onImportSource={handleImportSource}
        onOpenCatalogsFolder={handleOpenCatalogsFolder}
        onDeleteSource={handleDeleteSource}
        onSyncSource={handleSyncSource}
        onSyncAllSources={handleSyncAllSources}
        deletingSourceId={deletingSourceId}
        syncingSourceId={syncingSourceId}
        syncingAllSources={syncingAllSources}
        handleToggleSource={handleToggleSource}
        handleToggleRemoveTemp={handleToggleRemoveTemp}
        handleToggleSeed={handleToggleSeed}
        handleSpeedLimitChange={handleSpeedLimitChange}
        disabledSourcesReady={disabledSourcesReady}
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
