import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import type { LibraryTileActionContext } from './libraryTileActionContext'
import { buildLibraryPathFallbackAction } from './libraryTilePathFallbackAction'

export function buildLibraryJobPrimaryAction(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
  secondary: GameTileAction[],
): { primary: GameTileAction | null; secondary: GameTileAction[] } | null {
  const isDownloadingJob =
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  const isResumableJob =
    item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')

  if (isDownloadingJob) {
    return {
      primary: {
        id: 'queue',
        label: t('library.viewDownload'),
        title: t('library.viewDownloadTitle'),
        variant: 'primary',
        onClick: ctx.setActiveTabDownloads,
      },
      secondary,
    }
  }
  if (isResumableJob) {
    return {
      primary: {
        id: 'resume',
        label: t('library.resumeDownload'),
        title: t('library.resumeDownloadTitle'),
        variant: 'primary',
        onClick: () => void ctx.onResumeItem(item.id),
      },
      secondary,
    }
  }
  return null
}

export function buildLibraryPathPrimaryAction(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
  secondary: GameTileAction[],
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)

  if (ctx.canExtract) {
    return {
      primary: {
        id: 'extract',
        label: isInstallBusy ? t('library.extracting') : t('common.extract'),
        title: t('library.extractTitle'),
        variant: 'primary',
        disabled: isInstallBusy,
        onClick: () => void ctx.handleExtractItem(item),
      },
      secondary,
    }
  }
  return buildLibraryPathFallbackAction(item, t, ctx, secondary)
}
