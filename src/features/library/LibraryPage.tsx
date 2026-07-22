import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAppLanguage, APP_LOCALE, type AppLanguage } from '../../shared/config/locale'
import { EmptyState } from '../../shared/components/EmptyState'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import type { LibraryEntry } from './types'
import {
  useLibraryController,
  useLibraryItemHelpers,
  useLibraryResumeItem,
  useOpenLocalPath,
} from './LibraryController'
import { useFavoriteCatalog } from '../favorites/FavoriteCatalogProvider'
import { VirtualizedLibraryGrid } from './VirtualizedLibraryGrid'
import { LibrarySortToggle } from './LibrarySortToggle'
import { LibraryPageDetailView } from './LibraryPageDetailView'
import { LibraryInstallConfirm } from './LibraryInstallConfirm'
import { LibraryAddGameModal } from './LibraryAddGameModal'
import { buildLibraryGridModels } from './useLibraryGridModels'
import { libraryBusyKey } from './libraryTileActions'

export function LibraryPage() {
  const { t, i18n } = useTranslation()
  const currentLanguage: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE
  const controller = useLibraryController()
  const helpers = useLibraryItemHelpers()
  const onResumeItem = useLibraryResumeItem()
  const onOpenLocalPath = useOpenLocalPath()
  const [pendingInstall, setPendingInstall] = useState<LibraryEntry | null>(null)
  const [addGameOpen, setAddGameOpen] = useState(false)
  const [addGameBusy, setAddGameBusy] = useState(false)
  const { isFavorite, isBusy, toggleFavorite } = useFavoriteCatalog()
  const requestInstallConfirm = useCallback((item: LibraryEntry) => setPendingInstall(item), [])
  const openAddGame = useCallback(() => setAddGameOpen(true), [])
  const closeAddGame = useCallback(() => {
    if (addGameBusy) return
    setAddGameOpen(false)
  }, [addGameBusy])
  const submitAddGame = useCallback(
    async (path: string) => {
      setAddGameBusy(true)
      try {
        await controller.handleAddExternalGame(path)
        setAddGameOpen(false)
      } catch {
        // Erro já mostrado via toast no handler.
      } finally {
        setAddGameBusy(false)
      }
    },
    [controller.handleAddExternalGame],
  )
  const confirmInstallBusy =
    pendingInstall != null &&
    (controller.installBusyId === libraryBusyKey(pendingInstall) ||
      controller.installingKeys.has(libraryBusyKey(pendingInstall)))
  const gridModels = useMemo(
    () =>
      buildLibraryGridModels({
        t,
        currentLanguage,
        controller,
        helpers,
        onResumeItem,
        onOpenLocalPath,
        requestInstallConfirm,
      }),
    [controller, currentLanguage, helpers, onOpenLocalPath, onResumeItem, requestInstallConfirm, t],
  )

  if (controller.libraryDetail) {
    return (
      <LibraryPageDetailView
        detail={controller.libraryDetail}
        isFavorite={isFavorite}
        isBusy={isBusy}
        toggleFavorite={toggleFavorite}
        onBack={controller.closeLibraryDetail}
        setLibraryDetailNote={controller.setLibraryDetailNote}
        saveLibraryDetailNote={controller.saveLibraryDetailNote}
      />
    )
  }

  const hasFilter = controller.libraryFilter.trim().length > 0
  const emptyTitle = hasFilter ? t('library.noResultsTitle') : t('library.emptyTitle')

  return (
    <section className="library-page">
      <header className="library-toolbar">
        <SearchInput
          className="library-toolbar__search browse-search browse-search--soft"
          value={controller.libraryFilter}
          placeholder={t('library.filterPlaceholder')}
          searchFocusId="library"
          onChange={controller.setLibraryFilter}
        />
        <div className="library-toolbar__actions">
          <button
            type="button"
            className="library-toolbar__add"
            onClick={openAddGame}
          >
            {t('library.sidebarAdd')}
          </button>
        </div>
        <div className="library-toolbar__sort">
          <LibrarySortToggle value={controller.librarySort} onChange={controller.setLibrarySort} />
        </div>
      </header>
      {gridModels.length > 0 ? (
        <VirtualizedLibraryGrid models={gridModels} ariaLabel={t('nav.library')} />
      ) : (
        <EmptyState
          title={emptyTitle}
          description={hasFilter ? t('library.noResultsDescription') : undefined}
          action={
            hasFilter
              ? undefined
              : {
                  label: t('library.emptyCatalogAction'),
                  onClick: controller.onGoDiscover,
                }
          }
        />
      )}
      <LibraryAddGameModal
        open={addGameOpen}
        busy={addGameBusy}
        defaultPath={controller.defaultDownloadPath}
        onClose={closeAddGame}
        onSubmit={submitAddGame}
      />
      <LibraryInstallConfirm
        pendingInstall={pendingInstall}
        confirmInstallBusy={confirmInstallBusy}
        onConfirm={() => {
          const item = pendingInstall
          setPendingInstall(null)
          if (item) void controller.handleInstallItem(item)
        }}
        onCancel={() => setPendingInstall(null)}
      />
    </section>
  )
}
