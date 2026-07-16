import type { TFunction } from 'i18next'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAppLanguage, APP_LOCALE, type AppLanguage } from '../../shared/config/locale'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { LibrarySortToggle } from './LibrarySortToggle'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { LibraryEntry } from './types'
import {
  useLibraryController,
  useLibraryItemHelpers,
  useLibraryResumeItem,
  useOpenLocalPath,
} from './LibraryController'
import type { LibraryControllerValue } from './LibraryController'
import { DiscoverGameDetailPage } from '../discover/DiscoverGameDetailPage'
import { useFavoriteCatalog } from '../favorites/FavoriteCatalogProvider'
import { VirtualizedLibraryGrid } from './VirtualizedLibraryGrid'
import type { LibraryGridCardModel } from './LibraryGridCard'

import type { GameTileAction } from '../../shared/components/GameTileAction'

function busyKey(item: LibraryEntry) {
  return item.kind === 'job' ? item.id : item.destPath
}

function buildLibraryActions(
  item: LibraryEntry,
  t: TFunction,
  ctx: {
    key: string
    canPlay: boolean
    canInstall: boolean
    canLocate: boolean
    canExtract: boolean
    pathStatePending: boolean
    canDelete: boolean
    playBusyId: string | null
    installBusyId: string | null
    installingKeys: ReadonlySet<string>
    handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
    requestInstallConfirm: (item: LibraryEntry) => void
    handleExtractItem: (item: LibraryEntry) => Promise<void>
    handlePickGameInstallFolder: LibraryControllerValue['handlePickGameInstallFolder']
    handlePickLaunchExe: (item: LibraryEntry) => Promise<void>
    handleDeleteLibraryItem: (item: LibraryEntry) => void
    onResumeItem: (id: string) => Promise<void>
    onOpenLocalPath: (path: string) => Promise<void>
    setActiveTabDownloads: () => void
    openLibraryDetail: (item: LibraryEntry) => void
  },
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const secondary: GameTileAction[] = []
  const isInstallBusy =
    ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)
  const isPlayBusy = ctx.playBusyId === ctx.key
  const isDownloadingJob =
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  const isResumableJob =
    item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')

  // Submenu rico: ações úteis no contexto, além do clique principal.
  secondary.push({
    id: 'viewDetails',
    label: t('library.viewDetails'),
    title: t('library.viewDetailsTitle'),
    variant: 'outline',
    onClick: () => ctx.openLibraryDetail(item),
  })
  if (ctx.canPlay) {
    secondary.push({
      id: 'play-menu',
      label: isPlayBusy ? t('library.playStarting') : t('common.play'),
      title: t('library.playTitle'),
      variant: 'primary',
      disabled: isPlayBusy,
      onClick: () => void ctx.handlePlayLibraryItem(item),
    })
  }
  if (ctx.canInstall) {
    secondary.push({
      id: 'install-menu',
      label: isInstallBusy ? t('library.installing') : t('common.install'),
      title: isInstallBusy ? t('library.installingTitle') : t('library.installTitle'),
      variant: 'outline',
      disabled: isInstallBusy,
      onClick: () => ctx.requestInstallConfirm(item),
    })
  }
  if (ctx.canExtract) {
    secondary.push({
      id: 'extract-menu',
      label: isInstallBusy ? t('library.extracting') : t('common.extract'),
      title: t('library.extractTitle'),
      variant: 'outline',
      disabled: isInstallBusy,
      onClick: () => void ctx.handleExtractItem(item),
    })
  }
  if (isResumableJob) {
    secondary.push({
      id: 'resume-menu',
      label: t('library.resumeDownload'),
      title: t('library.resumeDownloadTitle'),
      variant: 'outline',
      onClick: () => void ctx.onResumeItem(item.id),
    })
  }
  if (item.kind === 'job') {
    secondary.push({
      id: 'queue-menu',
      label: t('library.viewDownload'),
      title: t('library.viewDownloadTitle'),
      variant: 'outline',
      onClick: ctx.setActiveTabDownloads,
    })
  }
  secondary.push({
    id: 'open',
    label: t('library.openExplorer'),
    title: t('library.openExplorerTitle'),
    variant: 'outline',
    onClick: () => void ctx.onOpenLocalPath(item.destPath),
  })
  if (ctx.canLocate || ctx.canPlay || ctx.canInstall) {
    secondary.push({
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
  secondary.push({
    id: 'pick-exe',
    label: t('library.pickLaunchExe'),
    title: t('library.pickLaunchExeTitle'),
    variant: 'outline',
    disabled: isInstallBusy,
    onClick: () => void ctx.handlePickLaunchExe(item),
  })
  if (ctx.canDelete) {
    secondary.push({
      id: 'delete',
      label: t('common.delete'),
      title: t('library.deleteTitle'),
      variant: 'danger',
      onClick: () => void ctx.handleDeleteLibraryItem(item),
    })
  }

  if (ctx.canInstall) {
    return {
      primary: {
        id: 'install',
        label: isInstallBusy ? t('library.installing') : t('common.install'),
        title: isInstallBusy ? t('library.installingTitle') : t('library.installTitle'),
        variant: 'primary',
        disabled: isInstallBusy,
        onClick: () => ctx.requestInstallConfirm(item),
      },
      secondary,
    }
  }

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

  if (ctx.pathStatePending) {
    return {
      primary: {
        id: 'pending',
        label: t('common.loading'),
        title: t('library.locateTitle'),
        variant: 'primary',
        disabled: true,
        onClick: () => { },
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

export function LibraryPage() {
  const { t, i18n } = useTranslation()
  const currentLanguage: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE
  const {
    filteredEntries,
    libraryFilter,
    librarySort,
    playBusyId,
    installBusyId,
    installingKeys,
    setLibraryFilter,
    setLibrarySort,
    onGoDownloads,
    handlePlayLibraryItem,
    handleInstallItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handlePickLaunchExe,
    handleDeleteLibraryItem,
    deletingLibraryKey,
    libraryDetail,
    openLibraryDetail,
    closeLibraryDetail,
    setLibraryDetailNote,
    saveLibraryDetailNote,
  } = useLibraryController()
  const {
    libraryStatusMeta,
    showPlayAction,
    showInstallAction,
    showLocateInstallAction,
    isPathStateResolved,
    hasManualInstallRoot,
  } = useLibraryItemHelpers()
  const onResumeItem = useLibraryResumeItem()
  const onOpenLocalPath = useOpenLocalPath()
  const [pendingInstall, setPendingInstall] = useState<LibraryEntry | null>(null)
  const { isFavorite, isBusy, toggleFavorite } = useFavoriteCatalog()

  const requestInstallConfirm = useCallback((item: LibraryEntry) => {
    setPendingInstall(item)
  }, [])

  const confirmInstallBusy =
    pendingInstall != null &&
    (installBusyId === busyKey(pendingInstall) ||
      installingKeys.has(busyKey(pendingInstall)))

  const gridModels = useMemo((): LibraryGridCardModel[] => {
    return filteredEntries.map((item) => {
      const key = busyKey(item)
      let statusMeta = libraryStatusMeta(item)
      if (playBusyId === key) {
        statusMeta = { labelKey: 'library.playStarting', tone: 'starting' }
      } else if (installBusyId === key) {
        statusMeta = { labelKey: 'library.installOpening', tone: 'installing' }
      }
      const canPlay = showPlayAction(item)
      const canInstall = showInstallAction(item)
      const canLocate = showLocateInstallAction(item)
      const pathStatePending = !isPathStateResolved(item)
      const manualRoot = hasManualInstallRoot(item)
      const { primary, secondary } = buildLibraryActions(item, t, {
        key,
        canPlay,
        canInstall,
        canLocate,
        canExtract: false,
        pathStatePending,
        canDelete: true,
        playBusyId,
        installBusyId,
        installingKeys,
        handlePlayLibraryItem,
        requestInstallConfirm,
        handleExtractItem,
        handlePickGameInstallFolder,
        handlePickLaunchExe,
        handleDeleteLibraryItem,
        onResumeItem,
        onOpenLocalPath,
        setActiveTabDownloads: onGoDownloads,
        openLibraryDetail,
      })
      return {
        item,
        statusMeta,
        primary,
        secondary,
        isDeleting:
          deletingLibraryKey === item.id || deletingLibraryKey === item.destPath,
        manualRoot,
        language: currentLanguage,
      }
    })
  }, [
    currentLanguage,
    deletingLibraryKey,
    filteredEntries,
    handleDeleteLibraryItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handlePickLaunchExe,
    handlePlayLibraryItem,
    hasManualInstallRoot,
    installBusyId,
    installingKeys,
    isPathStateResolved,
    libraryStatusMeta,
    onGoDownloads,
    onOpenLocalPath,
    onResumeItem,
    openLibraryDetail,
    playBusyId,
    requestInstallConfirm,
    showInstallAction,
    showLocateInstallAction,
    showPlayAction,
    t,
  ])

  if (libraryDetail) {
    const fallbackGame = {
      id: libraryDetail.item.id,
      title: libraryDetail.item.title,
      genre: '',
      source: 'library',
      groupKey: libraryDetail.game?.groupKey ?? null,
    }
    const game = libraryDetail.game ?? fallbackGame
    const detailFavorite = isFavorite(game)
    const detailFavoriteBusy = isBusy(game)
    return (
      <DiscoverGameDetailPage
        game={game}
        loading={libraryDetail.loading}
        error={libraryDetail.error}
        options={[]}
        synopsis={libraryDetail.synopsis}
        screenshots={libraryDetail.screenshots}
        busyUrl={null}
        favorite={detailFavorite}
        favoriteBusy={detailFavoriteBusy}
        hideDownloads
        onToggleFavorite={() => {
          if (detailFavoriteBusy) return
          void toggleFavorite(game)
        }}
        onBack={closeLibraryDetail}
        footerSlot={
          <label className="library-detail-note">
            <span className="library-detail-note__label">{t('library.noteLabel')}</span>
            <textarea
              className="library-detail-note__input"
              rows={3}
              value={libraryDetail.note}
              placeholder={t('library.notePlaceholder')}
              onChange={(event) => setLibraryDetailNote(event.target.value)}
              onBlur={() => void saveLibraryDetailNote()}
            />
            {libraryDetail.noteSaving ? (
              <span className="library-detail-note__hint">{t('common.saving')}</span>
            ) : null}
          </label>
        }
      />
    )
  }

  return (
    <section className="library-page">
      <header className="library-toolbar">
        <SearchInput
          className="library-toolbar__search browse-search browse-search--soft"
          value={libraryFilter}
          placeholder={t('library.filterPlaceholder')}
          searchFocusId="library"
          onChange={setLibraryFilter}
        />
        <div className="library-toolbar__sort">
          <LibrarySortToggle value={librarySort} onChange={setLibrarySort} />
        </div>
      </header>

      {gridModels.length > 0 ? (
        <VirtualizedLibraryGrid
          models={gridModels}
          ariaLabel={t('nav.library')}
        />
      ) : null}

      <ConfirmDialog
        open={pendingInstall !== null}
        title={t('library.installConfirmTitle')}
        description={
          pendingInstall
            ? t('library.installConfirmBody', {
              title: cleanTitleForDisplay(pendingInstall.title),
            })
            : ''
        }
        confirmLabel={t('common.install')}
        cancelLabel={t('common.cancel')}
        confirmVariant="primary"
        busy={confirmInstallBusy}
        onConfirm={() => {
          const item = pendingInstall
          setPendingInstall(null)
          if (item) void handleInstallItem(item)
        }}
        onCancel={() => setPendingInstall(null)}
      />
    </section>
  )
}
