import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { SETTING_KEY } from '../../shared/config/appSettings'
import { useToast } from '../../shared/components/ToastProvider'
import { formatUserError } from '../../shared/utils/formatUserError'

export function useInstallSettings() {
  const { t } = useTranslation()
  const { showError } = useToast()
  const settings = useAppSettings()
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const path = settings.defaultDownloadPath.trim()
    if (!path) setDiskFreeBytes(null)
    else {
      void sourcesApi.getDiskFreeBytesForPath(path).then((bytes) => {
        if (!cancelled) setDiskFreeBytes(bytes)
      })
    }
    return () => {
      cancelled = true
    }
  }, [settings.defaultDownloadPath])

  const handleSaveInstallSettings = async () => {
    const path = settings.defaultDownloadPath.trim()
    if (!path) {
      showError(t('settings.toastDestinationRequired'))
      return
    }
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      await sourcesApi.setAppSetting(
        SETTING_KEY.installOrganization,
        settings.installOrganization,
      )
      await sourcesApi.setAppSetting(
        SETTING_KEY.afterInstallAction,
        settings.afterInstallAction,
      )
      setDiskFreeBytes(await sourcesApi.getDiskFreeBytesForPath(path))
    } catch (error) {
      showError(formatUserError(error, t('settings.toastInstallSaveError')))
    }
  }

  const handleSelectDefaultPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('settings.toastSelectPathTitle'),
      defaultPath: settings.defaultDownloadPath || undefined,
    })
    if (typeof selected !== 'string') return
    settings.setDefaultDownloadPath(selected)
    try {
      await sourcesApi.setDefaultDownloadPath(selected)
      setDiskFreeBytes(await sourcesApi.getDiskFreeBytesForPath(selected))
    } catch {
      showError(t('settings.toastSavePathError'))
    }
  }

  return {
    defaultDownloadPath: settings.defaultDownloadPath,
    setDefaultDownloadPath: settings.setDefaultDownloadPath,
    installOrganization: settings.installOrganization,
    setInstallOrganization: settings.setInstallOrganization,
    afterInstallAction: settings.afterInstallAction,
    setAfterInstallAction: settings.setAfterInstallAction,
    diskFreeBytes,
    handleSaveInstallSettings,
    handleSelectDefaultPath,
  }
}
