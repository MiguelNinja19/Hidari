import { useEffect, useRef } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { bpsToSpeedKey, parseSettingFlag, SETTING_KEY } from '../../shared/config/appSettings'
import {
  APP_LOCALE,
  INSTALLER_LANGUAGE_MIGRATION_KEY,
  isAppLanguage,
  peekStoredLanguage,
  type AppLanguage,
} from '../../shared/config/locale'
import { setAppLanguage } from '../../shared/i18n'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'
import { parseDisabledSourceIds, type BootstrapSettings } from './bootstrapSettings'

async function resolveStartupLanguage(): Promise<AppLanguage> {
  const stored = peekStoredLanguage()
  let installer: string | null = null
  try {
    installer = await sourcesApi.getInstallerLanguage()
  } catch {
    // Tauri / não-Windows
  }
  const fromInstaller = isAppLanguage(installer) ? installer : null

  let migrationDone = false
  try {
    migrationDone = localStorage.getItem(INSTALLER_LANGUAGE_MIGRATION_KEY) === '1'
  } catch {
    /* ignore */
  }

  // Primeira execução pós-fix: o bootstrap antigo gravava "en" mesmo com
  // instalador em ES/RU — preferir o LCID do NSIS uma vez se ainda for o default.
  if (!migrationDone && fromInstaller && fromInstaller !== 'en' && (!stored || stored === 'en')) {
    try {
      localStorage.setItem(INSTALLER_LANGUAGE_MIGRATION_KEY, '1')
    } catch {
      /* ignore */
    }
    return fromInstaller
  }

  if (!migrationDone) {
    try {
      localStorage.setItem(INSTALLER_LANGUAGE_MIGRATION_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (stored) return stored
  if (fromInstaller) return fromInstaller
  return APP_LOCALE
}

export function useBootstrapSettings(settings: BootstrapSettings) {
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useEffect(() => {
    const setters = settingsRef.current
    let cancelled = false
    void (async () => {
      try {
        const raw = await sourcesApi.getAppSetting(SETTING_KEY.disabledHydraSourceIds)
        if (!cancelled) setters.setDisabledSourceIds(parseDisabledSourceIds(raw))
      } catch {
        // Tauri indisponível em browser
      } finally {
        if (!cancelled) setters.setDisabledSourcesReady(true)
      }
    })()
    void sourcesApi.getDefaultDownloadPath()
      .then((path) => {
        if (path) setters.setDefaultDownloadPath(path)
      })
      .catch(() => {})

    const cancelDeferred = scheduleDeferred(() => {
      void (async () => {
        try {
          const language = await resolveStartupLanguage()
          if (!cancelled) await setAppLanguage(language)
          setters.setSeedTorrentsEnabled(await sourcesApi.getSeedTorrentsEnabled())
          const [org, after, remove, speed, install, play, catalog] = await Promise.all([
            sourcesApi.getAppSetting(SETTING_KEY.installOrganization),
            sourcesApi.getAppSetting(SETTING_KEY.afterInstallAction),
            sourcesApi.getAppSetting(SETTING_KEY.removeTempFiles),
            sourcesApi.getAppSetting(SETTING_KEY.downloadSpeedLimitBps),
            sourcesApi.getAppSetting(SETTING_KEY.notifyReadyToInstall),
            sourcesApi.getAppSetting(SETTING_KEY.notifyReadyToPlay),
            sourcesApi.getAppSetting(SETTING_KEY.notifyCatalogChanges),
          ])
          if (org) setters.setInstallOrganization(org)
          if (after) setters.setAfterInstallAction(after)
          if (remove !== null) setters.setRemoveTemporaryFiles(remove === '1' || remove === 'true')
          if (speed !== null) setters.setDownloadSpeedLimit(bpsToSpeedKey(speed))
          setters.setNotifyReadyToInstall(parseSettingFlag(install))
          setters.setNotifyReadyToPlay(parseSettingFlag(play))
          setters.setNotifyCatalogChanges(parseSettingFlag(catalog, false))
        } catch {
          // Tauri indisponível em browser
        }
      })()
    }, 0)
    return () => {
      cancelled = true
      cancelDeferred()
    }
  }, [])
}
