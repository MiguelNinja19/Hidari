import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import type { LibraryTileActionContext } from './libraryTileActionContext'

export function buildLibraryMenuActions(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
): GameTileAction[] {
  const actions: GameTileAction[] = []
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)
  const isPlayBusy = ctx.playBusyId === ctx.key
  const isResumableJob =
    item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')

  actions.push({
    id: 'viewDetails',
    label: t('library.viewDetails'),
    title: t('library.viewDetailsTitle'),
    variant: 'outline',
    onClick: () => ctx.openLibraryDetail(item),
  })
  if (ctx.canPlay) {
    actions.push({
      id: 'play-menu',
      label: isPlayBusy ? t('library.playStarting') : t('common.play'),
      title: t('library.playTitle'),
      variant: 'primary',
      disabled: isPlayBusy,
      onClick: () => void ctx.handlePlayLibraryItem(item),
    })
  }
  if (ctx.canInstall) {
    actions.push({
      id: 'install-menu',
      label: isInstallBusy ? t('library.installing') : t('common.install'),
      title: isInstallBusy ? t('library.installingTitle') : t('library.installTitle'),
      variant: 'outline',
      disabled: isInstallBusy,
      onClick: () => ctx.requestInstallConfirm(item),
    })
  }
  if (ctx.canExtract) {
    actions.push({
      id: 'extract-menu',
      label: isInstallBusy ? t('library.extracting') : t('common.extract'),
      title: t('library.extractTitle'),
      variant: 'outline',
      disabled: isInstallBusy,
      onClick: () => void ctx.handleExtractItem(item),
    })
  }
  if (isResumableJob) {
    actions.push({
      id: 'resume-menu',
      label: t('library.resumeDownload'),
      title: t('library.resumeDownloadTitle'),
      variant: 'outline',
      onClick: () => void ctx.onResumeItem(item.id),
    })
  }
  if (item.kind === 'job') {
    actions.push({
      id: 'queue-menu',
      label: t('library.viewDownload'),
      title: t('library.viewDownloadTitle'),
      variant: 'outline',
      onClick: ctx.setActiveTabDownloads,
    })
  }
  return actions
}
