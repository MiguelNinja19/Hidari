import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import type { LibraryTileActionContext } from './libraryTileActionContext'
import {
  buildLibraryJobPrimaryAction,
  buildLibraryPathPrimaryAction,
} from './libraryTilePrimaryStates'

export function buildLibraryPrimaryAction(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
  secondary: GameTileAction[],
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)
  const isPlayBusy = ctx.playBusyId === ctx.key

  // Ordem: Play → Extract → Install → job/path fallback
  if (ctx.canPlay) {
    return {
      primary: {
        id: 'play',
        label: isPlayBusy ? t('library.playStarting') : t('common.play'),
        title: t('library.playTitle'),
        variant: 'primary',
        disabled: isPlayBusy,
        onClick: () => void ctx.handlePlayLibraryItem(item),
      },
      secondary,
    }
  }

  if (ctx.canExtract) {
    return {
      primary: {
        id: 'extract',
        label: isInstallBusy ? t('library.extracting') : t('common.extract'),
        title: t('library.extractTitle'),
        variant: 'primary',
        disabled: isInstallBusy || ctx.pathStatePending,
        onClick: () => void ctx.handleExtractItem(item),
      },
      secondary,
    }
  }

  if (ctx.canInstall) {
    return {
      primary: {
        id: 'install',
        label: isInstallBusy ? t('library.installing') : t('common.install'),
        title: isInstallBusy ? t('library.installingTitle') : t('library.installTitle'),
        variant: 'primary',
        disabled: isInstallBusy || ctx.pathStatePending,
        onClick: () => ctx.requestInstallConfirm(item),
      },
      secondary,
    }
  }

  const jobPrimary = buildLibraryJobPrimaryAction(item, t, ctx, secondary)
  if (jobPrimary) return jobPrimary

  return buildLibraryPathPrimaryAction(item, t, ctx, secondary)
}
