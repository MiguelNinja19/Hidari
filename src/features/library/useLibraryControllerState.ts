import { useState } from 'react'
import type { LibraryControllerValue } from './LibraryController'
import type { UseLibraryControllerStateArgs } from './libraryControllerTypes'
import { useLibraryCoverLookup } from './useLibraryCoverLookup'
import { useLibraryDelete } from './useLibraryDelete'
import { useLibraryDetail } from './useLibraryDetail'
import { useLibraryEntries } from './useLibraryEntries'
import { useLibraryInstall } from './useLibraryInstall'
import { useLibraryPathActions } from './useLibraryPathActions'
import { useLibraryPathState } from './useLibraryPathState'
import { useLibraryPlay } from './useLibraryPlay'
import { useLibraryPreferences } from './useLibraryPreferences'
import { useLibraryScan } from './useLibraryScan'

export function useLibraryControllerState(
  args: UseLibraryControllerStateArgs,
): LibraryControllerValue {
  const preferences = useLibraryPreferences(args.activeTab)
  const path = useLibraryPathState(args.defaultDownloadPath, args.jobs)
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const refreshLibraryScan = useLibraryScan({
    activeTab: args.activeTab,
    defaultDownloadPathRef: path.defaultDownloadPathRef,
    jobsRef: path.jobsRef,
    setLocalLibraryItems: path.setLocalLibraryItems,
    setLibraryScanSettled: path.setLibraryScanSettled,
    inspect: path.runBatchPathInspection,
  })
  const entries = useLibraryEntries({
    jobs: args.jobs,
    localLibraryItems: path.localLibraryItems,
    libraryFilter: preferences.libraryFilter,
    librarySort: preferences.librarySort,
    pathStateByKey: path.pathStateByKey,
    hiddenLibraryKeys,
    defaultDownloadPath: args.defaultDownloadPath,
  })
  useLibraryCoverLookup(
    args.activeTab, entries.libraryItems,
    args.resolveCover, args.resolveCoversBatch,
  )
  const install = useLibraryInstall({
    pathStateByKeyRef: path.pathStateByKeyRef,
    setPathStateByKey: path.setPathStateByKey,
    refreshPathState: path.installWatch.refreshPathState,
    removeInstallingKey: path.installWatch.removeInstallingKey,
    watchForInstalledGame: path.installWatch.watchForInstalledGame,
  })
  const pathActions = useLibraryPathActions({
    defaultDownloadPath: args.defaultDownloadPath,
    defaultDownloadPathRef: path.defaultDownloadPathRef,
    setInstallBusyId: install.setInstallBusyId,
    setPathStateByKey: path.setPathStateByKey,
    refreshPathState: path.installWatch.refreshPathState,
    refreshLibraryScan,
  })
  const deletion = useLibraryDelete({
    jobs: args.jobs, defaultDownloadPath: args.defaultDownloadPath,
    localLibraryItems: path.localLibraryItems, dispatch: args.dispatch,
    setLocalLibraryItems: path.setLocalLibraryItems,
    setPathStateByKey: path.setPathStateByKey,
    defaultDownloadPathRef: path.defaultDownloadPathRef,
    setHiddenLibraryKeys,
    installWatchRef: path.installWatch.installWatchRef,
    removeInstallingKey: path.installWatch.removeInstallingKey,
  })
  const detail = useLibraryDetail({
    defaultDownloadPath: args.defaultDownloadPath,
    dispatch: args.dispatch, onGoDownloads: args.onGoDownloads,
  })
  const play = useLibraryPlay({
    pathStateByKeyRef: path.pathStateByKeyRef,
    setPathStateByKey: path.setPathStateByKey,
  })

  return {
    ...entries, ...preferences, ...pathActions, ...deletion, ...detail, ...play,
    libraryReady: args.queueInitialized && path.libraryScanSettled,
    refreshLibraryScan, defaultDownloadPath: args.defaultDownloadPath,
    jobs: args.jobs, pathStateByKey: path.pathStateByKey,
    installBusyId: install.installBusyId,
    installingKeys: path.installWatch.installingKeys,
    handleInstallItem: install.handleInstallItem,
    handleExtractItem: install.handleExtractItem,
    onGoDownloads: args.onGoDownloads, onGoDiscover: args.onGoDiscover,
    resolveCover: args.resolveCover,
    invalidateLocalCover: args.invalidateLocalCover,
  }
}
