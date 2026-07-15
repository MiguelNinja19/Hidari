import { useCallback, useEffect, useRef, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  INSTALL_WATCH_INTERVAL_MS,
  INSTALL_WATCH_MAX_TICKS,
  INSTALL_WATCH_POST_CLOSE_TICKS,
  INSTALL_WATCH_START_GRACE_TICKS,
} from '../../shared/config/polling'
import { pathStateKey } from './libraryItemState'
import type { LibraryControllerValue } from './LibraryController'
import { setLibraryPathStateCacheEntry } from './libraryPathStateCache'

type InstallWatch = {
  intervalId: number
  busyKey: string
  setupPath: string
  ticks: number
  sawInstallerRunning: boolean
  installerClosedTick: number | null
}

type UseLibraryInstallWatchArgs = {
  defaultDownloadPathRef: React.MutableRefObject<string>
  setPathStateByKey: React.Dispatch<
    React.SetStateAction<LibraryControllerValue['pathStateByKey']>
  >
}

export function useLibraryInstallWatch({
  defaultDownloadPathRef,
  setPathStateByKey,
}: UseLibraryInstallWatchArgs) {
  const [installingKeys, setInstallingKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const installWatchRef = useRef<Map<string, InstallWatch>>(new Map())

  const addInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((prev) => {
      if (prev.has(busyKey)) return prev
      const next = new Set(prev)
      next.add(busyKey)
      return next
    })
  }, [])

  const removeInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((prev) => {
      if (!prev.has(busyKey)) return prev
      const next = new Set(prev)
      next.delete(busyKey)
      return next
    })
  }, [])

  const refreshPathState = useCallback(
    async (title: string, path: string, jobId?: string) => {
      const key = pathStateKey(path, { jobId, title })
      const state = await sourcesApi.inspectLibraryPath(title, path, jobId)
      setLibraryPathStateCacheEntry(key, state, defaultDownloadPathRef.current)
      setPathStateByKey((prev) => ({ ...prev, [key]: state }))
      return state
    },
    [defaultDownloadPathRef, setPathStateByKey],
  )

  const stopInstallWatch = useCallback(
    (watchKey: string) => {
      const watch = installWatchRef.current.get(watchKey)
      if (!watch) return
      window.clearInterval(watch.intervalId)
      installWatchRef.current.delete(watchKey)
      removeInstallingKey(watch.busyKey)
    },
    [removeInstallingKey],
  )

  const watchForInstalledGame = useCallback(
    (
      title: string,
      destPath: string,
      busyKey: string,
      setupPath: string,
      jobId?: string,
    ) => {
      const watchKey = pathStateKey(destPath, { jobId, title })
      const existing = installWatchRef.current.get(watchKey)
      if (existing) {
        window.clearInterval(existing.intervalId)
        installWatchRef.current.delete(watchKey)
      }
      addInstallingKey(busyKey)

      const tick = async () => {
        const watch = installWatchRef.current.get(watchKey)
        if (!watch) return
        watch.ticks += 1

        try {
          const state = await refreshPathState(title, destPath, jobId)
          if (state.hasGame) {
            stopInstallWatch(watchKey)
            return
          }
        } catch {
          // continua a monitorizar
        }

        if (watch.setupPath && watch.ticks > INSTALL_WATCH_START_GRACE_TICKS) {
          let running = false
          try {
            running = await sourcesApi.isExecutableRunning(watch.setupPath)
          } catch {
            // keep false
          }

          if (running) {
            watch.sawInstallerRunning = true
            watch.installerClosedTick = null
          } else if (watch.sawInstallerRunning) {
            if (watch.installerClosedTick === null) {
              watch.installerClosedTick = watch.ticks
            } else if (
              watch.ticks - watch.installerClosedTick >=
              INSTALL_WATCH_POST_CLOSE_TICKS
            ) {
              stopInstallWatch(watchKey)
              return
            }
          }
        }

        if (watch.ticks >= INSTALL_WATCH_MAX_TICKS) {
          stopInstallWatch(watchKey)
        }
      }

      const intervalId = window.setInterval(() => {
        void tick()
      }, INSTALL_WATCH_INTERVAL_MS)
      installWatchRef.current.set(watchKey, {
        intervalId,
        busyKey,
        setupPath,
        ticks: 0,
        sawInstallerRunning: false,
        installerClosedTick: null,
      })
      void tick()
    },
    [addInstallingKey, refreshPathState, stopInstallWatch],
  )

  useEffect(() => {
    const watches = installWatchRef.current
    return () => {
      for (const watch of watches.values()) {
        window.clearInterval(watch.intervalId)
      }
      watches.clear()
    }
  }, [])

  return {
    installingKeys,
    installWatchRef,
    refreshPathState,
    removeInstallingKey,
    watchForInstalledGame,
  }
}
