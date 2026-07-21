import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import type { LibraryTileActionContext } from './libraryTileActionContext'

export function buildLibraryFileActions(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
): GameTileAction[] {
  const actions: GameTileAction[] = []
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)

  if (item.external) {
    actions.push({
      id: 'remove-external',
      label: t('library.removeFromLibrary'),
      title: t('library.removeFromLibraryTitle'),
      variant: 'danger',
      onClick: () => void ctx.handleDeleteLibraryItem(item),
    })
    return actions
  }

  actions.push({
    id: 'open',
    label: t('library.openExplorer'),
    title: t('library.openExplorerTitle'),
    variant: 'outline',
    onClick: () => void ctx.onOpenLocalPath(item.destPath),
  })
  if (ctx.canLocate || ctx.canPlay || ctx.canInstall) {
    actions.push({
      id: 'locate',
      label: t('library.locateFolder'),
      title: t('library.locateFolderTitle'),
      variant: 'outline',
      disabled: isInstallBusy,
      onClick: () =>
        void ctx.handlePickGameInstallFolder(
          item.title,
          item.destPath,
          ctx.key,
          item.kind === 'job' ? item.id : undefined,
        ),
    })
  }
  actions.push({
    id: 'pick-exe',
    label: t('library.pickLaunchExe'),
    title: t('library.pickLaunchExeTitle'),
    variant: 'outline',
    disabled: isInstallBusy,
    onClick: () => void ctx.handlePickLaunchExe(item),
  })
  if (ctx.canPlay) {
    actions.push({
      id: 'create-shortcut',
      label: t('library.createShortcut'),
      title: t('library.createShortcutTitle'),
      variant: 'outline',
      onClick: () => void ctx.handleCreateDesktopShortcut(item),
    })
  }
  if (ctx.canDelete) {
    actions.push({
      id: 'delete',
      label: t('library.uninstall'),
      title: t('library.deleteTitle'),
      variant: 'danger',
      onClick: () => void ctx.handleDeleteLibraryItem(item),
    })
  }
  return actions
}
