import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAppLanguage, APP_LOCALE, type AppLanguage } from '../../shared/config/locale'
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
  const { isFavorite, isBusy, toggleFavorite } = useFavoriteCatalog()
  const requestInstallConfirm = useCallback((item: LibraryEntry) => setPendingInstall(item), [])
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
        <div className="library-toolbar__sort">
          <LibrarySortToggle value={controller.librarySort} onChange={controller.setLibrarySort} />
        </div>
      </header>
      {gridModels.length > 0 ? (
        <VirtualizedLibraryGrid models={gridModels} ariaLabel={t('nav.library')} />
      ) : null}
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
