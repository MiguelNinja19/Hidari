import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscoverNoSources } from './DiscoverNoSources'
import { DiscoverEmptyCatalog } from './DiscoverEmptyCatalog'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { EmptyState } from '../../shared/components/EmptyState'
import { DiscoverGameCard } from './DiscoverGameCard'
import { PageCenterSpinner } from '../../shared/components/PageCenterSpinner'
import { Loader } from '../../shared/components/Loader'
import { Spinner } from '../../shared/components/Spinner'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { Button } from '../../shared/components/ui/Button'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import { useCovers } from '../covers/CoversProvider'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import {
  dedupeDownloadOptions,
  pickOptionLabel,
  pickOptionMeta,
  pickOptionVariantLabel,
} from '../../shared/utils/pickDownloadOptions'
import { useDiscoverController } from './DiscoverController'

export function DiscoverPage() {
  const { t } = useTranslation()
  const {
    discoverSearch,
    discoverSearchDraft,
    setDiscoverSearchDraft,
    submitDiscoverSearch,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    loadMoreCatalog,
    displayCatalogSource,
    discoverPickGame,
    discoverPickLoading,
    discoverPickError,
    discoverPickOptions,
    discoverBusy,
    enabledSourcesCount,
    sources,
    sourcesLoading,
    isSourceEnabled,
    onGoSettings,
    openGameDetail,
    closeDiscoverPicker,
    handleEnqueueFromDiscover,
  } = useDiscoverController()

  const { resolveCover, warmCover, warmCovers, invalidateLocalCover, resolveCoversBatch } = useCovers()

  const query = discoverSearch.trim()
  const isSearching = query.length >= 2
  const resultCount = displayCatalogSource.length
  const hasActiveSources = enabledSourcesCount > 0
  const hasCatalogData = useMemo(
    () => sources.some((source) => isSourceEnabled(source.id) && source.downloadCount > 0),
    [sources, isSourceEnabled],
  )

  // Pré-aquece as primeiras capas assim que os resultados chegam (sem esperar scroll).
  // DiscoverTab trata batch/warm da página; aqui só prioriza as 8 do viewport.
  useEffect(() => {
    if (!isSearching || catalogLoading || displayCatalogSource.length === 0) return

    const toWarm: { title: string; coverUrl: string }[] = []
    for (const game of displayCatalogSource.slice(0, 8)) {
      const url = game.coverUrl?.trim()
      if (url) toWarm.push({ title: game.title, coverUrl: url })
    }
    if (toWarm.length > 0) warmCovers(toWarm)
  }, [catalogLoading, displayCatalogSource, isSearching, warmCovers])

  const pickCover = discoverPickGame
    ? resolveCover(discoverPickGame.title, discoverPickGame.coverUrl)
    : null
  const pickCoverUrl = discoverPickGame?.coverUrl?.trim() || pickCover?.coverUrl || null

  const pickOptions = useMemo(
    () => dedupeDownloadOptions(discoverPickOptions),
    [discoverPickOptions],
  )

  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!discoverPickGame) return
    modalRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDiscoverPicker()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [discoverPickGame, closeDiscoverPicker])

  return (
    <section
      className={`browse-page${catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''}`}
    >
      <header className="page-toolbar page-toolbar--discover">
        <div className="page-toolbar__search">
          <div className="discover-search-inline">
            <SearchInput
              value={discoverSearchDraft}
              searchFocusId="discover"
              className="browse-search browse-search--bar discover-search-inline__field"
              inputClassName="browse-search__input discover-search-inline__input"
              placeholder={
                hasActiveSources
                  ? t('discover.searchPlaceholder')
                  : t('discover.searchPlaceholderNoSources')
              }
              disabled={!hasActiveSources}
              onChange={setDiscoverSearchDraft}
              onSubmit={submitDiscoverSearch}
            />
            <Button
              type="button"
              variant="primary"
              className="discover-search-inline__btn"
              disabled={!hasActiveSources || catalogLoading}
              onClick={submitDiscoverSearch}
            >
              {catalogLoading ? (
                <Loader
                  size="sm"
                  className="discover-search-inline__btn-loader"
                  label={t('discover.searching')}
                />
              ) : (
                t('common.search')
              )}
            </Button>
          </div>
        </div>
      </header>

      {!sourcesLoading && !hasActiveSources ? (
        <DiscoverNoSources onGoSettings={onGoSettings} />
      ) : null}

      {hasActiveSources && !hasCatalogData && !isSearching ? (
        <DiscoverEmptyCatalog onGoSettings={onGoSettings} />
      ) : null}

      {hasActiveSources && isSearching && catalogLoading ? (
        <PageCenterSpinner label={t('discover.searching')} />
      ) : null}

      {hasActiveSources && isSearching && !catalogLoading && resultCount > 0 ? (
        <ul className="discover-grid">
          {displayCatalogSource.map((game, index) => {
            const cover = resolveCover(game.title, game.coverUrl, game.localCoverPath)
            const itemCoverUrl = game.coverUrl?.trim() || cover.coverUrl
            const itemLocalPath = game.localCoverPath?.trim() || cover.localPath
            const displayTitle = catalogGameDisplayTitle(game.title)

            return (
              <CoverWarmGridItem
                key={game.id}
                title={game.title}
                coverUrl={itemCoverUrl}
                warmCover={warmCover}
                onNeedsCover={(title) => resolveCoversBatch([title])}
                className="discover-grid__item"
              >
                <DiscoverGameCard
                  title={displayTitle}
                  titleAttr={game.title}
                  genre=""
                  cover={
                    <CatalogCover
                      title={game.title}
                      coverUrl={itemCoverUrl}
                      localPath={itemLocalPath}
                      cached={Boolean(itemLocalPath)}
                      status={cover.status}
                      priority={index < 8}
                      onLocalCoverError={() =>
                        invalidateLocalCover(game.title, itemCoverUrl ?? game.coverUrl)
                      }
                    />
                  }
                  actionLabel={t('discover.viewSources')}
                  onOpen={() => openGameDetail(game)}
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}

      {hasActiveSources && isSearching && !catalogLoading && resultCount > 0 && catalogHasMore ? (
        <div className="discover-load-more">
          <Button
            type="button"
            variant="outline"
            disabled={catalogLoadingMore}
            onClick={() => void loadMoreCatalog()}
          >
            {catalogLoadingMore ? t('discover.loadingMore') : t('discover.loadMore')}
          </Button>
        </div>
      ) : null}

      {hasActiveSources && isSearching && !catalogLoading && resultCount === 0 ? (
        <EmptyState
          title={t('discover.noResultsTitle')}
          description={t('discover.noResultsDescription', { query })}
        />
      ) : null}

      {discoverPickGame ? (
        <div
          className="pick-modal-backdrop"
          role="presentation"
          onClick={() => closeDiscoverPicker()}
        >
          <div
            ref={modalRef}
            className="pick-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="pick-modal__close"
              onClick={() => closeDiscoverPicker()}
              aria-label={t('common.close')}
            />

            <div className="pick-modal__hero">
              <div className="pick-modal__cover">
                <CatalogCover
                  title={discoverPickGame.title}
                  coverUrl={pickCoverUrl}
                  localPath={
                    pickCover &&
                    (pickCover.coverUrl === pickCoverUrl || !discoverPickGame.coverUrl?.trim())
                      ? pickCover.localPath
                      : null
                  }
                  cached={pickCover?.status === 'cached'}
                  status={pickCoverUrl ? (pickCover?.status ?? 'idle') : 'idle'}
                  priority
                  onLocalCoverError={() =>
                    invalidateLocalCover(
                      discoverPickGame.title,
                      pickCoverUrl ?? discoverPickGame.coverUrl,
                    )
                  }
                />
              </div>
              <div className="pick-modal__info">
                <p className="pick-modal__eyebrow">{t('discover.downloadModalEyebrow')}</p>
                <h2 id="discover-modal-title" className="pick-modal__title">
                  {discoverPickGame.title}
                </h2>
                {!discoverPickLoading && pickOptions.length > 0 ? (
                  <p className="pick-modal__summary">
                    {t('discover.pickOptionsAvailable', { count: pickOptions.length })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="pick-modal__body">
              {discoverPickLoading ? (
                <div className="pick-modal__loading">
                  <Spinner size="md" label={t('discover.loadingOptions')} />
                  <p className="pick-modal__loading-label">{t('discover.loadingOptions')}</p>
                </div>
              ) : null}

              {!discoverPickLoading && discoverPickError ? (
                <p className="pick-modal__empty pick-modal__empty--error">{discoverPickError}</p>
              ) : null}

              {!discoverPickLoading && !discoverPickError && pickOptions.length === 0 ? (
                <p className="pick-modal__empty">{t('discover.noDownloadsAvailable')}</p>
              ) : null}

              {!discoverPickLoading && pickOptions.length > 0 ? (
                <>
                  <p className="pick-modal__section-label">{t('discover.pickVersion')}</p>
                  <ul className="pick-modal__options">
                    {pickOptions.map((opt, index) => {
                      const busy = discoverBusy === opt.url
                      const fullTitle = pickOptionLabel(opt)
                      const variant = pickOptionVariantLabel(opt, discoverPickGame.title)
                      const meta = pickOptionMeta(opt)
                      return (
                        <li key={`${opt.url}-${index}`}>
                          <div className="pick-modal__option" title={fullTitle}>
                            <span className="pick-modal__option-main">
                              <span className="pick-modal__option-variant">{variant}</span>
                              <span className="pick-modal__option-meta">
                                <span>{meta.source}</span>
                                {meta.size ? <span>{meta.size}</span> : null}
                                <span>{meta.downloadType}</span>
                              </span>
                            </span>
                            <button
                              type="button"
                              className="pick-modal__option-action"
                              disabled={busy}
                              onClick={() =>
                                void handleEnqueueFromDiscover(
                                  opt.title,
                                  opt.url,
                                  discoverPickGame?.coverUrl,
                                )
                              }
                            >
                              {busy ? '…' : t('common.download')}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
