import type { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localeForLanguage, isAppLanguage, APP_LOCALE, type AppLanguage } from '../../shared/config/locale'
import type { LibraryStatusMeta } from './libraryItemState'
import { itemPathCtx, pathStateKey } from './libraryItemState'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { LibraryGameCard } from './LibraryGameCard'
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
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'

import type { GameTileAction } from '../../shared/components/GameTileAction'

function formatStatusPct(pct: number, language: AppLanguage): string {
  const decimal = localeForLanguage(language) === 'en-US' ? '.' : ','
  return `${pct.toFixed(1).replace('.', decimal)}%`
}

function libraryStatusLine(
  meta: LibraryStatusMeta,
  primary: GameTileAction | null,
  t: TFunction,
  language: AppLanguage,
): string | null {
  if (meta.tone === 'ready' || meta.tone === 'waiting') return null
  if (
    (primary?.id === 'play' || primary?.id === 'install') &&
    meta.tone !== 'installing' &&
    meta.tone !== 'verifying'
  ) {
    return null
  }
  if (meta.pct != null) {
    return t(meta.labelKey, { pct: formatStatusPct(meta.pct, language) })
  }
  return t(meta.labelKey)
}

function libraryPendingActivity(meta: LibraryStatusMeta): boolean {
  return (
    meta.tone === 'verifying' ||
    meta.tone === 'installing' ||
    (meta.tone === 'downloading' && meta.pct == null)
  )
}

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
    resolveCover,
    invalidateLocalCover,
    handlePlayLibraryItem,
    handleInstallItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handlePickLaunchExe,
    handleDeleteLibraryItem,
    deletingLibraryKey,
    pathStateByKey,
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
  const [detailFavorite, setDetailFavorite] = useState(false)
  const [detailFavoriteBusy, setDetailFavoriteBusy] = useState(false)

  useEffect(() => {
    if (!libraryDetail?.game) {
      setDetailFavorite(false)
      return
    }
    let cancelled = false
    const key = libraryDetail.game.id || libraryDetail.game.title
    void sourcesApi
      .isFavoriteCatalogEntry(key)
      .then((value) => {
        if (!cancelled) setDetailFavorite(value)
      })
      .catch(() => {
        if (!cancelled) setDetailFavorite(false)
      })
    return () => {
      cancelled = true
    }
  }, [libraryDetail?.game])

  const requestInstallConfirm = useCallback((item: LibraryEntry) => {
    setPendingInstall(item)
  }, [])

  const confirmInstallBusy =
    pendingInstall != null &&
    (installBusyId === busyKey(pendingInstall) ||
      installingKeys.has(busyKey(pendingInstall)))

  if (libraryDetail) {
    const fallbackGame = {
      id: libraryDetail.item.id,
      title: libraryDetail.item.title,
      genre: '',
      source: 'library',
    }
    const game = libraryDetail.game ?? fallbackGame
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
          if (!libraryDetail.game || detailFavoriteBusy) return
          setDetailFavoriteBusy(true)
          void sourcesApi
            .toggleFavoriteCatalogEntry(
              libraryDetail.game.title,
              libraryDetail.game.id || undefined,
            )
            .then(setDetailFavorite)
            .catch(() => {})
            .finally(() => setDetailFavoriteBusy(false))
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

      {filteredEntries.length > 0 ? (
        <ul className="library-grid">
          {filteredEntries.map((item) => {
            const statusMeta = libraryStatusMeta(item)
            const cover = resolveCover(item.title)
            const key = busyKey(item)
            const canPlay = showPlayAction(item)
            const canInstall = showInstallAction(item)
            const canLocate = showLocateInstallAction(item)
            const pathStatePending = !isPathStateResolved(item)
            const canDelete = true
            const manualRoot = hasManualInstallRoot(item)
            const canExtract = false

            const { primary, secondary } = buildLibraryActions(item, t, {
              key,
              canPlay,
              canInstall,
              canLocate,
              canExtract,
              pathStatePending,
              canDelete,
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

            const statusLine = libraryStatusLine(statusMeta, primary, t, currentLanguage)
            const isDeletingCard =
              deletingLibraryKey === item.id || deletingLibraryKey === item.destPath
            const pendingActivity = libraryPendingActivity(statusMeta) || isDeletingCard
            const hasCover =
              cover.status !== 'error' &&
              Boolean(cover.localPath?.trim() || cover.coverUrl?.trim())

            return (
              <li
                key={item.id}
                className={[
                  'library-grid__item',
                  isDeletingCard ? 'library-grid__item--deleting' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <LibraryGameCard
                  title={cleanTitleForDisplay(item.title)}
                  titleAttr={[
                    cleanTitleForDisplay(item.title),
                    statusMeta.pct != null
                      ? t(statusMeta.labelKey, { pct: formatStatusPct(statusMeta.pct, currentLanguage) })
                      : t(statusMeta.labelKey),
                    manualRoot ? t('library.manualFolder') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  showTitle={!hasCover}
                  metaLine={isDeletingCard ? t('library.deleting') : statusLine}
                  pendingActivity={pendingActivity}
                  isDeleting={isDeletingCard}
                  cover={
                    <CatalogCover
                      title={item.title}
                      coverUrl={cover.coverUrl}
                      localPath={cover.localPath}
                      cached={cover.status === 'cached'}
                      status={cover.status}
                      priority
                      onLocalCoverError={() => invalidateLocalCover(item.title, cover.coverUrl)}
                    />
                  }
                  primaryAction={isDeletingCard ? null : primary}
                  secondaryActions={isDeletingCard ? [] : secondary}
                />
              </li>
            )
          })}
        </ul>
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
