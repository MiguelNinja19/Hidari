import type { TFunction } from 'i18next'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localeForLanguage, isAppLanguage, type AppLanguage } from '../../shared/config/locale'
import type { LibraryStatusMeta } from './libraryItemState'
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
  if (primary?.id === 'play' || primary?.id === 'install') return null
  if (meta.pct != null) {
    return t(meta.labelKey, { pct: formatStatusPct(meta.pct, language) })
  }
  return t(meta.labelKey)
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
    pathStatePending: boolean
    canDelete: boolean
    playBusyId: string | null
    installBusyId: string | null
    installingKeys: ReadonlySet<string>
    handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
    requestInstallConfirm: (item: LibraryEntry) => void
    handlePickGameInstallFolder: LibraryControllerValue['handlePickGameInstallFolder']
    handleDeleteLibraryItem: (item: LibraryEntry) => void
    onResumeItem: (id: string) => Promise<void>
    onOpenLocalPath: (path: string) => Promise<void>
    setActiveTabDownloads: () => void
  },
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const secondary: GameTileAction[] = []

  const addOpenFolder = () => {
    secondary.push({
      id: 'open',
      label: t('library.openFolder'),
      title: t('library.openFolderTitle'),
      variant: 'outline',
      onClick: () => void ctx.onOpenLocalPath(item.destPath),
    })
  }

  const addLocate = () => {
    secondary.push({
      id: 'locate',
      label: t('library.locate'),
      title: t('library.locateTitle'),
      variant: 'outline',
      disabled: ctx.installBusyId === ctx.key,
      onClick: () =>
        void ctx.handlePickGameInstallFolder(
          item.title,
          item.destPath,
          ctx.key,
          item.kind === 'job' ? item.id : undefined,
        ),
    })
  }

  const addDelete = () => {
    secondary.push({
      id: 'delete',
      label: t('common.delete'),
      title: t('library.deleteTitle'),
      variant: 'danger',
      onClick: () => void ctx.handleDeleteLibraryItem(item),
    })
  }

  if (ctx.canInstall) {
    const isInstallBusy =
      ctx.installBusyId === ctx.key || ctx.installingKeys.has(ctx.key)
    secondary.push({
      id: 'install-menu',
      label: isInstallBusy ? t('library.installing') : t('common.install'),
      title: isInstallBusy ? t('library.installingTitle') : t('library.installTitle'),
      variant: 'primary',
      disabled: isInstallBusy,
      onClick: () => ctx.requestInstallConfirm(item),
    })
    addOpenFolder()
    if (ctx.canLocate) addLocate()
    if (ctx.canDelete) addDelete()
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
    secondary.push({
      id: 'play-menu',
      label: ctx.playBusyId === ctx.key ? t('library.playStarting') : t('common.play'),
      title: t('library.playTitle'),
      variant: 'primary',
      disabled: ctx.playBusyId === ctx.key,
      onClick: () => void ctx.handlePlayLibraryItem(item),
    })
    addOpenFolder()
    if (ctx.canDelete) addDelete()
    return {
      primary: {
        id: 'play',
        label: ctx.playBusyId === ctx.key ? t('library.playStarting') : t('common.play'),
        title: t('library.playTitle'),
        variant: 'primary',
        disabled: ctx.playBusyId === ctx.key,
        onClick: () => void ctx.handlePlayLibraryItem(item),
      },
      secondary,
    }
  }

  if (
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  ) {
    addOpenFolder()
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

  if (item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')) {
    addOpenFolder()
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
      secondary: [],
    }
  }

  if (ctx.canLocate) {
    addOpenFolder()
    if (ctx.canDelete) addDelete()
    return {
      primary: {
        id: 'locate-primary',
        label: ctx.installBusyId === ctx.key ? t('library.installOpening') : t('library.locateFolder'),
        title: t('library.locateFolderTitle'),
        variant: 'primary',
        disabled: ctx.installBusyId === ctx.key,
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

  addOpenFolder()
  if (ctx.canDelete) addDelete()
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
  const currentLanguage: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'pt-BR'
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
    handlePickGameInstallFolder,
    handleDeleteLibraryItem,
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

  const requestInstallConfirm = useCallback((item: LibraryEntry) => {
    setPendingInstall(item)
  }, [])

  const confirmInstallBusy =
    pendingInstall != null &&
    (installBusyId === busyKey(pendingInstall) ||
      installingKeys.has(busyKey(pendingInstall)))
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

            const { primary, secondary } = buildLibraryActions(item, t, {
              key,
              canPlay,
              canInstall,
              canLocate,
              pathStatePending,
              canDelete,
              playBusyId,
              installBusyId,
              installingKeys,
              handlePlayLibraryItem,
              requestInstallConfirm,
              handlePickGameInstallFolder,
              handleDeleteLibraryItem,
              onResumeItem,
              onOpenLocalPath,
              setActiveTabDownloads: onGoDownloads,
            })

            const statusLine = libraryStatusLine(statusMeta, primary, t, currentLanguage)
            const hasCover =
              cover.status !== 'error' &&
              Boolean(cover.localPath?.trim() || cover.coverUrl?.trim())

            return (
              <li key={item.id} className="library-grid__item">
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
                  metaLine={statusLine}
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
                  primaryAction={primary}
                  secondaryActions={secondary}
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
