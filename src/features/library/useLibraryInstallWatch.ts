import { useCallback, useEffect, useRef } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { INSTALL_WATCH_INTERVAL_MS } from '../../shared/config/polling'
import { pathStateKey } from './libraryItemState'
import type { LibraryControllerValue } from './LibraryController'
import { tickInstallWatch, type InstallWatch } from './libraryInstallWatchTick'
import { setLibraryPathStateCacheEntry } from './libraryPathStateCache'
import { useInstallingKeys } from './useInstallingKeys'

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
  const { installingKeys, addInstallingKey, removeInstallingKey } =
    useInstallingKeys()
  const installWatchRef = useRef<Map<string, InstallWatch>>(new Map())

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

      const tick = () => tickInstallWatch({
        watches: installWatchRef.current,
        watchKey,
        title,
        destPath,
        jobId,
        refreshPathState,
        stopInstallWatch,
      })

      const intervalId = window.setInterval(() => void tick(), INSTALL_WATCH_INTERVAL_MS)
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
      for (const watch of watches.values()) window.clearInterval(watch.intervalId)
      watches.clear()
    }
  }, [])

  return {
    installingKeys, installWatchRef, refreshPathState,
    removeInstallingKey, watchForInstalledGame,
  }
}
