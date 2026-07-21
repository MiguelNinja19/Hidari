import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { getPathState, itemPathCtx, pathStateKey } from './libraryItemState'
import type { PathStateMap, PathStateSetter } from './libraryControllerTypes'
import type { LibraryEntry } from './types'

type Args = {
  pathStateByKeyRef: React.MutableRefObject<PathStateMap>
  setPathStateByKey: PathStateSetter
  refreshPathState: (title: string, path: string, jobId?: string) => unknown
  removeInstallingKey: (key: string) => void
  watchForInstalledGame: (
    title: string, path: string, key: string, setup: string, jobId?: string,
  ) => void
}

export function useLibraryInstall(args: Args) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [installBusyId, setInstallBusyId] = useState<string | null>(null)
  const handleExtractItem = useCallback(async (item: LibraryEntry) => {
    const key = item.kind === 'job' ? item.id : item.destPath
    const jobId = item.kind === 'job' ? item.id : undefined
    setInstallBusyId(key)
    try {
      await sourcesApi.extractLibraryFolder(item.title, item.destPath, jobId)
      void args.refreshPathState(item.title, item.destPath, jobId)
    } catch (error) {
      const message = formatUserError(error)
      if (message.trim()) showError(message)
    } finally {
      setInstallBusyId(null)
    }
  }, [args, showError])

  const handleInstallItem = useCallback(async (item: LibraryEntry) => {
    const key = item.kind === 'job' ? item.id : item.destPath
    const jobId = item.kind === 'job' ? item.id : undefined
    // Reinspect fresco antes de abrir setup — evita cache stale a pedir Install.
    let pathState = getPathState(
      item.destPath, args.pathStateByKeyRef.current, itemPathCtx(item),
    )
    setInstallBusyId(key)
    try {
      const fresh = await sourcesApi.inspectLibraryPath(item.title, item.destPath, jobId)
      args.setPathStateByKey((prev) => ({
        ...prev, [pathStateKey(item.destPath, itemPathCtx(item))]: fresh,
      }))
      pathState = fresh
      if (fresh.hasGame || fresh.playable) return
      if (!fresh.needsInstall && !fresh.needsExtraction) {
        showError(t('library.extractNoSetup'))
        return
      }
      let setup = pathState?.installPath
      if (pathState?.needsExtraction) {
        await sourcesApi.extractLibraryFolder(item.title, item.destPath, jobId)
        const state = await sourcesApi.inspectLibraryPath(
          item.title, item.destPath, jobId,
        )
        args.setPathStateByKey((prev) => ({
          ...prev, [pathStateKey(item.destPath, itemPathCtx(item))]: state,
        }))
        if (state.hasGame || state.playable) return
        if (!state.needsInstall && !state.installPath) {
          showError(t('library.extractNoSetup'))
          return
        }
        setup = state.installPath
      }
      if (!setup && !pathState?.needsInstall) {
        showError(t('library.extractNoSetup'))
        return
      }
      const setupPath = await sourcesApi.launchSetup(
        item.title, item.destPath, jobId, setup,
      )
      args.watchForInstalledGame(item.title, item.destPath, key, setupPath, jobId)
      void args.refreshPathState(item.title, item.destPath, jobId)
    } catch (error) {
      const message = formatUserError(error)
      if (message.trim()) showError(message)
      args.removeInstallingKey(key)
    } finally {
      setInstallBusyId(null)
    }
  }, [args, showError, t])

  return { installBusyId, setInstallBusyId, handleExtractItem, handleInstallItem }
}
