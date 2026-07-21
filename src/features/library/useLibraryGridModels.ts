import type { TFunction } from 'i18next'
import type { AppLanguage } from '../../shared/config/locale'
import { itemNeedsExtraction } from './libraryItemActions'
import type { LibraryControllerValue } from './LibraryController'
import type { LibraryGridCardModel } from './LibraryGridCard'
import { buildLibraryTileActions, libraryBusyKey } from './libraryTileActions'
import type { LibraryEntry } from './types'

type BuildGridModelsInput = {
  t: TFunction
  currentLanguage: AppLanguage
  controller: LibraryControllerValue
  helpers: {
    libraryStatusMeta: (item: LibraryEntry) => LibraryGridCardModel['statusMeta']
    showPlayAction: (item: LibraryEntry) => boolean
    showInstallAction: (item: LibraryEntry) => boolean
    showLocateInstallAction: (item: LibraryEntry) => boolean
    isPathStateResolved: (item: LibraryEntry) => boolean
    hasManualInstallRoot: (item: LibraryEntry) => boolean
  }
  onResumeItem: (id: string) => Promise<void>
  onOpenLocalPath: (path: string) => Promise<void>
  requestInstallConfirm: (item: LibraryEntry) => void
}

export function buildLibraryGridModels({
  t,
  currentLanguage,
  controller,
  helpers,
  onResumeItem,
  onOpenLocalPath,
  requestInstallConfirm,
}: BuildGridModelsInput): LibraryGridCardModel[] {
  return controller.filteredEntries.map((item) => {
    const key = libraryBusyKey(item)
    let statusMeta = helpers.libraryStatusMeta(item)
    if (controller.playBusyId === key) {
      statusMeta = { labelKey: 'library.playStarting', tone: 'starting' }
    } else if (controller.installBusyId === key) {
      statusMeta = { labelKey: 'library.installOpening', tone: 'installing' }
    }
    const canPlay = helpers.showPlayAction(item)
    const canInstall = helpers.showInstallAction(item)
    const canLocate = helpers.showLocateInstallAction(item)
    const pathStatePending = !helpers.isPathStateResolved(item)
    const manualRoot = helpers.hasManualInstallRoot(item)
    const canExtract = itemNeedsExtraction(item, controller.pathStateByKey)
    const { primary, secondary } = buildLibraryTileActions(item, t, {
      key,
      canPlay,
      canInstall,
      canLocate,
      canExtract,
      pathStatePending,
      canDelete: true,
      playBusyId: controller.playBusyId,
      installBusyId: controller.installBusyId,
      installingKeys: controller.installingKeys,
      handlePlayLibraryItem: controller.handlePlayLibraryItem,
      requestInstallConfirm,
      handleExtractItem: controller.handleExtractItem,
      handlePickGameInstallFolder: controller.handlePickGameInstallFolder,
      handlePickLaunchExe: controller.handlePickLaunchExe,
      handleCreateDesktopShortcut: controller.handleCreateDesktopShortcut,
      handleOpenOriginLauncher: controller.handleOpenOriginLauncher,
      handleDeleteLibraryItem: controller.handleDeleteLibraryItem,
      onResumeItem,
      onOpenLocalPath,
      setActiveTabDownloads: controller.onGoDownloads,
      openLibraryDetail: controller.openLibraryDetail,
    })
    return {
      item,
      statusMeta,
      primary,
      secondary,
      isDeleting:
        controller.deletingLibraryKey === item.id ||
        controller.deletingLibraryKey === item.destPath,
      manualRoot,
      language: currentLanguage,
    }
  })
}
