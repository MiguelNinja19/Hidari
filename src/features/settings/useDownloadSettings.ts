import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { SETTING_KEY, speedKeyToBps } from '../../shared/config/appSettings'
import { useToast } from '../../shared/components/ToastProvider'
import { formatUserError } from '../../shared/utils/formatUserError'

export function useDownloadSettings() {
  const { t } = useTranslation()
  const { showError } = useToast()
  const settings = useAppSettings()
  const [minimizeToTray, setMinimizeToTray] = useState(false)

  useEffect(() => {
    let cancelled = false
    void sourcesApi.getAppSetting(SETTING_KEY.minimizeToTray).then((value) => {
      if (!cancelled) setMinimizeToTray(value === '1' || value === 'true')
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (
    apply: (value: boolean) => void,
    next: boolean,
    action: () => Promise<unknown>,
    errorKey: string,
  ) => {
    apply(next)
    try {
      await action()
    } catch (error) {
      apply(!next)
      showError(formatUserError(error, t(errorKey)))
    }
  }

  return {
    removeTemporaryFiles: settings.removeTemporaryFiles,
    seedTorrentsEnabled: settings.seedTorrentsEnabled,
    downloadSpeedLimit: settings.downloadSpeedLimit,
    minimizeToTray,
    handleToggleRemoveTemp: (next: boolean) =>
      persist(
        settings.setRemoveTemporaryFiles,
        next,
        () => sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0'),
        'settings.toastTempSaveError',
      ),
    handleToggleSeed: (next: boolean) =>
      persist(
        settings.setSeedTorrentsEnabled,
        next,
        () => sourcesApi.setSeedTorrentsEnabled(next),
        'settings.toastSeedSaveError',
      ),
    handleSpeedLimitChange: async (value: string) => {
      settings.setDownloadSpeedLimit(value)
      try {
        await sourcesApi.setAppSetting(
          SETTING_KEY.downloadSpeedLimitBps,
          String(speedKeyToBps(value)),
        )
      } catch (error) {
        showError(formatUserError(error, t('settings.toastSpeedSaveError')))
      }
    },
    handleToggleMinimizeToTray: (next: boolean) =>
      persist(
        setMinimizeToTray,
        next,
        () => sourcesApi.setAppSetting(SETTING_KEY.minimizeToTray, next ? '1' : '0'),
        'settings.toastTraySaveError',
      ),
  }
}
