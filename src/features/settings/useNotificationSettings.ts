import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { SETTING_KEY } from '../../shared/config/appSettings'
import { useToast } from '../../shared/components/ToastProvider'
import { formatUserError } from '../../shared/utils/formatUserError'
import { sendHidariNotification } from '../../shared/utils/osNotification'

export function useNotificationSettings() {
  const { t } = useTranslation()
  const { showError, showSuccess } = useToast()
  const settings = useAppSettings()
  const [notifyTestBusy, setNotifyTestBusy] = useState(false)

  const persist = async (
    key: string,
    next: boolean,
    apply: (value: boolean) => void,
    previous: boolean,
  ) => {
    apply(next)
    try {
      await sourcesApi.setAppSetting(key, next ? '1' : '0')
    } catch (error) {
      apply(previous)
      showError(formatUserError(error, t('settings.toastNotifySaveError')))
    }
  }

  const handleTestNotification = async () => {
    setNotifyTestBusy(true)
    try {
      const title = t('settings.notifyTestTitle')
      const body = t('settings.notifyTestBody')
      if (await sendHidariNotification({ title, body })) {
        showSuccess(`${title} · ${body}`)
      } else {
        showError(t('settings.notifyTestError'))
      }
    } catch (error) {
      showError(formatUserError(error, t('settings.notifyTestError')))
    } finally {
      setNotifyTestBusy(false)
    }
  }

  return {
    notifyReadyToInstall: settings.notifyReadyToInstall,
    notifyReadyToPlay: settings.notifyReadyToPlay,
    notifyCatalogChanges: settings.notifyCatalogChanges,
    notifyTestBusy,
    handleToggleNotifyReadyToInstall: (next: boolean) =>
      persist(
        SETTING_KEY.notifyReadyToInstall,
        next,
        settings.setNotifyReadyToInstall,
        settings.notifyReadyToInstall,
      ),
    handleToggleNotifyReadyToPlay: (next: boolean) =>
      persist(
        SETTING_KEY.notifyReadyToPlay,
        next,
        settings.setNotifyReadyToPlay,
        settings.notifyReadyToPlay,
      ),
    handleToggleNotifyCatalogChanges: (next: boolean) =>
      persist(
        SETTING_KEY.notifyCatalogChanges,
        next,
        settings.setNotifyCatalogChanges,
        settings.notifyCatalogChanges,
      ),
    handleTestNotification,
  }
}
