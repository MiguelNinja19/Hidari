import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { useAppDispatch } from '../../app/hooks'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { SETTING_KEY } from '../../shared/config/appSettings'
import { useToast } from '../../shared/components/ToastProvider'
import { formatUserError } from '../../shared/utils/formatUserError'
import { deleteSource } from '../sources/sourcesSlice'

export function useSourceManagement() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { showError } = useToast()
  const settings = useAppSettings()
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const onDeleteSource = useCallback((id: string, name: string) => {
    setPendingDelete({ id, name })
  }, [])

  const cancelDelete = useCallback(() => {
    if (!deletingSourceId) setPendingDelete(null)
  }, [deletingSourceId])

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deletingSourceId) return
    const sourceId = pendingDelete.id
    setDeletingSourceId(sourceId)
    try {
      await dispatch(deleteSource(sourceId)).unwrap()
      const next = settings.disabledSourceIds.filter((id) => id !== sourceId)
      settings.setDisabledSourceIds(next)
      try {
        await sourcesApi.setAppSetting(
          SETTING_KEY.disabledHydraSourceIds,
          JSON.stringify(next),
        )
      } catch (error) {
        showError(formatUserError(error, t('settings.toastSourcesSaveError')))
      }
      setPendingDelete(null)
    } finally {
      setDeletingSourceId(null)
    }
  }, [deletingSourceId, dispatch, pendingDelete, settings, showError, t])

  const onToggleSourceEnabled = useCallback(
    async (sourceId: string, enable: boolean) => {
      if (!settings.disabledSourcesReady) return
      const previous = settings.disabledSourceIds
      const next = enable
        ? previous.filter((id) => id !== sourceId)
        : previous.includes(sourceId)
          ? previous
          : [...previous, sourceId]
      settings.setDisabledSourceIds(next)
      try {
        await sourcesApi.setAppSetting(
          SETTING_KEY.disabledHydraSourceIds,
          JSON.stringify(next),
        )
      } catch (error) {
        settings.setDisabledSourceIds(previous)
        showError(formatUserError(error, t('settings.toastSourcesSaveError')))
      }
    },
    [settings, showError, t],
  )

  return {
    disabledSourceIds: settings.disabledSourceIds,
    disabledSourcesReady: settings.disabledSourcesReady,
    deletingSourceId,
    pendingDelete,
    onDeleteSource,
    onToggleSourceEnabled,
    confirmDelete,
    cancelDelete,
  }
}
