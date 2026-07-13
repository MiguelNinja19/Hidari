import { useEffect } from 'react'
import { useAppDispatch } from '../hooks'
import { fetchSources } from '../../features/sources/sourcesSlice'
import { extractStatusReceived, fetchJobs, jobProgressReceived } from '../../features/queue/queueSlice'
import { notifyLibraryRefreshNeeded } from '../libraryRefreshBridge'
import { tauriClient } from '../../shared/api/tauri/client'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { STARTUP_JOBS_DEFER_MS } from '../../shared/config/polling'
import {
  bpsToSpeedKey,
  SETTING_KEY,
} from '../../shared/config/appSettings'
import { isAppLanguage } from '../../shared/config/locale'
import { setAppLanguage, default as i18n } from '../../shared/i18n'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'
type BootstrapSettings = {
  setDefaultDownloadPath: (path: string) => void
  setSeedTorrentsEnabled: (v: boolean) => void
  setInstallOrganization: (v: string) => void
  setAfterInstallAction: (v: string) => void
  setRemoveTemporaryFiles: (v: boolean) => void
  setDownloadSpeedLimit: (v: string) => void
  setDisabledSourceIds: (v: string[]) => void
  setDisabledSourcesReady: (v: boolean) => void
}

function parseDisabledSourceIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
      return arr
    }
  } catch {
    // JSON inválido
  }
  return []
}

/** Carrega fontes, settings e listeners Tauri no arranque. */
export function useAppBootstrap(settings: BootstrapSettings) {
  const dispatch = useAppDispatch()
  const {
    setDefaultDownloadPath,
    setSeedTorrentsEnabled,
    setInstallOrganization,
    setAfterInstallAction,
    setRemoveTemporaryFiles,
    setDownloadSpeedLimit,
    setDisabledSourceIds,
    setDisabledSourcesReady,
  } = settings

  useEffect(() => {
    let cancelled = false
    void dispatch(fetchSources())
    const cancelJobsDefer = scheduleDeferred(() => {
      void dispatch(fetchJobs())
    }, STARTUP_JOBS_DEFER_MS)

    // Fontes desativadas: carregar já (sem atraso de 400ms) para não mostrar tudo
    // ativo e para o toggle não gravar por cima duma lista ainda não hidratada.
    void (async () => {
      try {
        const dis = await sourcesApi.getAppSetting(SETTING_KEY.disabledHydraSourceIds)
        if (cancelled) return
        setDisabledSourceIds(parseDisabledSourceIds(dis))
      } catch {
        // Tauri indisponível (ex.: dev no browser)
      } finally {
        if (!cancelled) setDisabledSourcesReady(true)
      }
    })()

    void (async () => {
      try {
        const path = await sourcesApi.getDefaultDownloadPath()
        if (path) {
          setDefaultDownloadPath(path)
        }
      } catch {
        // Tauri indisponível (ex.: dev no browser)
      }
    })()

    const cancelSettingsDefer = scheduleDeferred(() => {
      void (async () => {
        try {
          // UI (localStorage/i18n) é a fonte de verdade; sincroniza para o SQLite
          // para sinopses Steam usarem o mesmo idioma (en/es/ru/pt-BR).
          const uiLang = isAppLanguage(i18n.language) ? i18n.language : 'pt-BR'
          await setAppLanguage(uiLang)

          const enabled = await sourcesApi.getSeedTorrentsEnabled()
          setSeedTorrentsEnabled(enabled)
          const [org, after, rem, speed] = await Promise.all([
            sourcesApi.getAppSetting(SETTING_KEY.installOrganization),
            sourcesApi.getAppSetting(SETTING_KEY.afterInstallAction),
            sourcesApi.getAppSetting(SETTING_KEY.removeTempFiles),
            sourcesApi.getAppSetting(SETTING_KEY.downloadSpeedLimitBps),
          ])
          if (org) setInstallOrganization(org)
          if (after) setAfterInstallAction(after)
          if (rem !== null) setRemoveTemporaryFiles(rem === '1' || rem === 'true')
          if (speed !== null) setDownloadSpeedLimit(bpsToSpeedKey(speed))
        } catch {
          // Tauri indisponível (ex.: dev no browser)
        }
      })()
    }, 0)

    let unlistenJob: (() => void) | undefined
    let unlistenExtract: (() => void) | undefined
    void tauriClient.listenJobProgress((event) => {
      dispatch(jobProgressReceived(event))
      if (
        event.status === 'completed' ||
        event.status === 'seeding' ||
        event.status === 'extracted'
      ) {
        notifyLibraryRefreshNeeded()
      }
    }).then((fn) => {
      unlistenJob = fn
    })
    void tauriClient.listenExtractStatus((event) => {
      dispatch(extractStatusReceived(event))
      if (
        event.status === 'extracted' ||
        event.status === 'completed' ||
        event.status === 'failed' ||
        event.status === 'skipped' ||
        event.status === 'verified' ||
        event.status === 'verify_failed'
      ) {
        notifyLibraryRefreshNeeded()
      }
    }).then((fn) => {
      unlistenExtract = fn
    })

    return () => {
      cancelled = true
      cancelJobsDefer()
      cancelSettingsDefer()
      unlistenJob?.()
      unlistenExtract?.()
    }
  }, [
    dispatch,
    setAfterInstallAction,
    setDefaultDownloadPath,
    setDisabledSourceIds,
    setDisabledSourcesReady,
    setDownloadSpeedLimit,
    setInstallOrganization,
    setRemoveTemporaryFiles,
    setSeedTorrentsEnabled,
  ])
}
