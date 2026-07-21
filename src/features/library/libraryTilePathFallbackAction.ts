import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import type { LibraryTileActionContext } from './libraryTileActionContext'

export function buildLibraryPathFallbackAction(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
  secondary: GameTileAction[],
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)

  if (ctx.pathStatePending) {
    return {
      primary: {
        id: 'pending',
        label: t('common.loading'),
        title: t('library.locateTitle'),
        variant: 'primary',
        disabled: true,
        onClick: () => {},
      },
      secondary,
    }
  }
  if (ctx.canLocate) {
    return {
      primary: {
        id: 'locate-primary',
        label: isInstallBusy ? t('library.installOpening') : t('library.locateFolder'),
        title: t('library.locateFolderTitle'),
        variant: 'primary',
        disabled: isInstallBusy,
        onClick: () =>
          void ctx.handlePickGameInstallFolder(
            item.title,
            item.destPath,
            ctx.key,
            item.kind === 'job' ? item.id : undefined,
          ),
      },
      secondary,
    }
  }
  return {
    primary: {
      id: 'open-primary',
      label: t('library.openExplorer'),
      title: t('library.openExplorerTitle'),
      variant: 'outline',
      onClick: () => void ctx.onOpenLocalPath(item.destPath),
    },
    secondary: secondary.filter((action) => action.id !== 'open'),
  }
}
