import { useEffect, useState } from 'react'
import { open, ask } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { APP_LOCALE } from '../../shared/config/locale'
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
import { formatSize } from '../../shared/utils/formatters'
import { useToast } from '../../shared/components/ToastProvider'
import { useErrorToast } from '../../shared/hooks/useErrorToast'

export function SettingsTab() {
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
  } = useAppSettings()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)

  const [addingSource, setAddingSource] = useState(false)
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
  const [syncingAllSources, setSyncingAllSources] = useState(false)
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)
  const { showError, showSuccess } = useToast()

  useErrorToast(sourcesError, 'Falha ao carregar fontes.')

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

  const handleImportSource = async () => {
    if (addingSource) return
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Catálogo JSON', extensions: ['json'] }],
    })
    if (typeof selected !== 'string' || !selected.toLowerCase().endsWith('.json')) return

    setAddingSource(true)
    try {
      const source = await dispatch(addSource({ url: selected.trim() })).unwrap()
      showSuccess(`${source.downloadCount.toLocaleString(APP_LOCALE)} jogos importados.`)
    } catch (error) {
      showError(formatUserError(error, 'Falha ao importar a fonte.'))
    } finally {
      setAddingSource(false)
    }
  }

  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    const confirmed = await ask(
      `Deseja excluir a fonte "${sourceName}"?\n\nIsso remove o catálogo da aplicação, mas não apaga o arquivo .json do seu disco.`,
      { title: 'Remover fonte', kind: 'warning' },
    )
    if (!confirmed) return

    setDeletingSourceId(sourceId)
    try {
      await dispatch(deleteSource(sourceId)).unwrap()
      const next = disabledSourceIds.filter((id) => id !== sourceId)
      setDisabledSourceIds(next)
      void sourcesApi.setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next))
    } finally {
      setDeletingSourceId(null)
    }
  }

  const handleSyncSource = async (sourceId: string, sourceName: string) => {
    setSyncingSourceId(sourceId)
    try {
      await dispatch(syncSource(sourceId)).unwrap()
      showSuccess(`Fonte ${sourceName} atualizada`)
    } finally {
      setSyncingSourceId(null)
    }
  }

  const handleSyncAllSources = async () => {
    if (sources.length === 0 || syncingAllSources) return
    setSyncingAllSources(true)
    try {
      await dispatch(syncAllSources()).unwrap()
      showSuccess('Todas as fontes atualizadas')
      await dispatch(fetchSources())
    } finally {
      setSyncingAllSources(false)
    }
  }

  const handleSaveInstallSettings = async () => {
    const path = defaultDownloadPath.trim()
    if (!path) {
      showError('Indique uma pasta de destino.')
      return
    }
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      await sourcesApi.setAppSetting(SETTING_KEY.installOrganization, installOrganization)
      await sourcesApi.setAppSetting(SETTING_KEY.afterInstallAction, afterInstallAction)
      const bytes = await sourcesApi.getDiskFreeBytesForPath(path)
      setDiskFreeBytes(bytes)
    } catch (error) {
      showError(formatUserError(error, 'Falha ao salvar configurações de instalação.'))
    }
  }

  const handleSelectDefaultPath = async () => {
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
        const bytes = await sourcesApi.getDiskFreeBytesForPath(selected)
        setDiskFreeBytes(bytes)
      } catch {
        showError('Não foi possível salvar a pasta. Execute com "npm run tauri:dev".')
      }
    }
  }

  const handleToggleRemoveTemp = async (next: boolean) => {
    setRemoveTemporaryFiles(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0')
    } catch (error) {
      setRemoveTemporaryFiles(!next)
      showError(formatUserError(error, 'Falha ao salvar opção de arquivos temporários.'))
    }
  }

  const handleSpeedLimitChange = async (value: string) => {
    setDownloadSpeedLimit(value)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.downloadSpeedLimitBps, String(speedKeyToBps(value)))
    } catch (error) {
      showError(formatUserError(error, 'Falha ao salvar limite de velocidade.'))
    }
  }

  const handleToggleSource = (sourceId: string) => {
    const isDisabled = disabledSourceIds.includes(sourceId)
    const next = isDisabled
      ? disabledSourceIds.filter((x) => x !== sourceId)
      : [...disabledSourceIds, sourceId]
    setDisabledSourceIds(next)
    void sourcesApi.setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next)).catch(
      (error) => {
        showError(formatUserError(error, 'Falha ao salvar fontes ativas.'))
      },
    )
  }

  const handleToggleSeed = async (enabled: boolean) => {
    setSeedTorrentsEnabled(enabled)
    try {
      await sourcesApi.setSeedTorrentsEnabled(enabled)
    } catch (error) {
      setSeedTorrentsEnabled(!enabled)
      showError(formatUserError(error, 'Falha ao salvar preferência de semeadura.'))
    }
  }

  return (
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
      isSourceEnabled={isSourceEnabled}
      setDefaultDownloadPath={setDefaultDownloadPath}
      setInstallOrganization={setInstallOrganization}
      setAfterInstallAction={setAfterInstallAction}
      handleSelectDefaultPath={handleSelectDefaultPath}
      handleSaveInstallSettings={handleSaveInstallSettings}
      onImportSource={handleImportSource}
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
      formatSize={formatSize}
    />
  )
}
