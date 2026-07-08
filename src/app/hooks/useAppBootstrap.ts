import { useEffect } from 'react'
import { useAppDispatch } from '../hooks'
import { fetchSources } from '../../features/sources/sourcesSlice'
import { extractStatusReceived, fetchJobs, jobProgressReceived } from '../../features/queue/queueSlice'
import { tauriClient } from '../../shared/api/tauri/client'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { STARTUP_JOBS_DEFER_MS } from '../../shared/config/polling'
import {
  bpsToSpeedKey,
  SETTING_KEY,
} from '../../shared/config/appSettings'
import { scheduleDeferred } from '../../shared/utils/scheduleDeferred'
type BootstrapSettings = {
  setDefaultDownloadPath: (path: string) => void
  setSeedTorrentsEnabled: (v: boolean) => void
  setInstallOrganization: (v: string) => void
  setAfterInstallAction: (v: string) => void
  setRemoveTemporaryFiles: (v: boolean) => void
  setDownloadSpeedLimit: (v: string) => void
  setDisabledSourceIds: (v: string[]) => void
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
  } = settings

  useEffect(() => {
    void dispatch(fetchSources())
    const cancelJobsDefer = scheduleDeferred(() => {
      void dispatch(fetchJobs())
    }, STARTUP_JOBS_DEFER_MS)

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
          const enabled = await sourcesApi.getSeedTorrentsEnabled()
          setSeedTorrentsEnabled(enabled)
          const [org, after, rem, speed, dis] = await Promise.all([
            sourcesApi.getAppSetting(SETTING_KEY.installOrganization),
            sourcesApi.getAppSetting(SETTING_KEY.afterInstallAction),
            sourcesApi.getAppSetting(SETTING_KEY.removeTempFiles),
            sourcesApi.getAppSetting(SETTING_KEY.downloadSpeedLimitBps),
            sourcesApi.getAppSetting(SETTING_KEY.disabledHydraSourceIds),
          ])
          if (org) setInstallOrganization(org)
          if (after) setAfterInstallAction(after)
          if (rem !== null) setRemoveTemporaryFiles(rem === '1' || rem === 'true')
          if (speed !== null) setDownloadSpeedLimit(bpsToSpeedKey(speed))
          if (dis) {
            try {
              const arr = JSON.parse(dis) as unknown
              if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
                setDisabledSourceIds(arr)
              }
            } catch {
              // ignora JSON inválido
            }
          }
        } catch {
          // Tauri indisponível (ex.: dev no browser)
        }
      })()
    }, 400)

    let unlistenJob: (() => void) | undefined
    let unlistenExtract: (() => void) | undefined
    void tauriClient.listenJobProgress((event) => {
      dispatch(jobProgressReceived(event))
    }).then((fn) => {
      unlistenJob = fn
    })
    void tauriClient.listenExtractStatus((event) => {
      dispatch(extractStatusReceived(event))
    }).then((fn) => {
      unlistenExtract = fn
    })

    return () => {
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
    setDownloadSpeedLimit,
    setInstallOrganization,
    setRemoveTemporaryFiles,
    setSeedTorrentsEnabled,
  ])
}
