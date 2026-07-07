import { useEffect, useMemo, useRef } from 'react'
import { DiscoverNoSources } from './DiscoverNoSources'
import { DiscoverEmptyCatalog } from './DiscoverEmptyCatalog'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { EmptyState } from '../../shared/components/EmptyState'
import { GameTile, GameTileSkeleton } from '../../shared/components/GameTile'
import { Loader } from '../../shared/components/Loader'
import { PageNotice } from '../../shared/components/PageNotice'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { Button } from '../../shared/components/ui/Button'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import type { CatalogGame, DownloadOption, Source } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import { dedupeDownloadOptions, pickOptionLabel, pickOptionMetaLine, pickOptionVariantLabel } from '../../shared/utils/pickDownloadOptions'

type DiscoverPageProps = {
  discoverSearch: string
  catalogLoading: boolean
  catalogLoadingMore: boolean
  catalogHasMore: boolean
  loadMoreCatalog: () => Promise<void>
  discoverError: string
  catalogError: string
  displayCatalogSource: CatalogGame[]
  discoverPickGame: CatalogGame | null
  discoverPickLoading: boolean
  discoverPickError: string | null
  discoverPickOptions: DownloadOption[]
  discoverBusy: string | null
  enabledSourcesCount: number
  sources: Source[]
  sourcesLoading: boolean
  isSourceEnabled: (sourceId: string) => boolean
  setDiscoverSearch: (value: string) => void
  onGoSettings: () => void
  openDiscoverPicker: (game: CatalogGame) => void
  closeDiscoverPicker: () => void
  handleEnqueueFromDiscover: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  resolveCover: (
    title: string,
    catalogCoverUrl?: string | null,
    catalogLocalPath?: string | null,
  ) => ResolvedCover
  warmCover: (title: string, coverUrl: string) => void
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function DiscoverPage({
  discoverSearch,
  catalogLoading,
  catalogLoadingMore,
  catalogHasMore,
  loadMoreCatalog,
  discoverError,
  catalogError,
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
  setDiscoverSearch,
  onGoSettings,
  openDiscoverPicker,
  closeDiscoverPicker,
  handleEnqueueFromDiscover,
  resolveCover,
  warmCover,
  invalidateLocalCover,
}: DiscoverPageProps) {
  const query = discoverSearch.trim()
  const isSearching = query.length >= 2
  const resultCount = displayCatalogSource.length
  const hasActiveSources = enabledSourcesCount > 0
  const hasCatalogData = useMemo(
    () =>
      sources.some((source) => isSourceEnabled(source.id) && source.downloadCount > 0),
    [sources, isSourceEnabled],
  )

  const pickCover = discoverPickGame
    ? resolveCover(discoverPickGame.title, discoverPickGame.coverUrl)
    : null
  const pickCoverUrl =
    discoverPickGame?.coverUrl?.trim() || pickCover?.coverUrl || null

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

  const pageError = discoverPickGame ? null : discoverError || catalogError || null

  return (
    <section
      className={`browse-page${catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''}`}
    >
      <header className="page-toolbar page-toolbar--discover">
        <div className="page-toolbar__search">
          <SearchInput
            value={discoverSearch}
            placeholder={
              hasActiveSources ? 'Nome do jogo (mín. 2 letras)…' : 'Importe uma fonte em Configurações…'
            }
            disabled={!hasActiveSources}
            onClick={!hasActiveSources ? onGoSettings : undefined}
            onChange={setDiscoverSearch}
            trailing={
              catalogLoading ? (
                <Loader size="sm" className="browse-search__loader" label="Pesquisando" />
              ) : null
            }
          />
        </div>
      </header>

      {pageError?.trim() ? <PageNotice error={pageError} /> : null}

      {!hasActiveSources ? (
        <DiscoverNoSources
          sources={sources}
          sourcesLoading={sourcesLoading}
          isSourceEnabled={isSourceEnabled}
          onGoSettings={onGoSettings}
        />
      ) : null}

      {hasActiveSources && !hasCatalogData ? (
        <DiscoverEmptyCatalog onGoSettings={onGoSettings} />
      ) : null}

      {hasActiveSources && hasCatalogData && isSearching && catalogLoading ? (
        <ul className="library-grid library-grid--skeleton" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <GameTileSkeleton key={index} />
          ))}
        </ul>
      ) : null}

      {hasActiveSources && hasCatalogData && isSearching && !catalogLoading && resultCount > 0 ? (
        <ul className="library-grid">
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
                className="library-grid__item"
              >
                <GameTile
                  title={displayTitle}
                  titleAttr={game.title}
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
                  primaryAction={{
                    id: 'download',
                    label: 'Ver opções',
                    variant: 'primary',
                    onClick: () => openDiscoverPicker(game),
                  }}
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}

      {hasActiveSources && hasCatalogData && isSearching && !catalogLoading && resultCount > 0 && catalogHasMore ? (
        <div className="discover-load-more">
          <Button
            type="button"
            variant="outline"
            disabled={catalogLoadingMore}
            onClick={() => void loadMoreCatalog()}
          >
            {catalogLoadingMore ? 'Carregando…' : 'Carregar mais'}
          </Button>
        </div>
      ) : null}

      {hasActiveSources && hasCatalogData && isSearching && !catalogLoading && resultCount === 0 ? (
        <EmptyState
          title="Sem resultados"
          description={`Não encontramos jogos para "${query}". Tente outro nome ou verifique as fontes ativas.`}
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
              aria-label="Fechar"
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
                  status={pickCoverUrl ? pickCover?.status ?? 'idle' : 'idle'}
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
                <p className="pick-modal__eyebrow">Download</p>
                <h2
                  id="discover-modal-title"
                  className="pick-modal__title"
                  title={discoverPickGame.title}
                >
                  {catalogGameDisplayTitle(discoverPickGame.title)}
                </h2>
                {!discoverPickLoading ? (
                  <p className="pick-modal__hint">
                    {pickOptions.length > 1
                      ? `${pickOptions.length} versões disponíveis`
                      : pickOptions.length === 1
                        ? '1 versão disponível'
                        : 'A carregar opções…'}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="pick-modal__body">
              {discoverPickLoading ? (
                <div className="pick-modal__empty">
                  <Loader size="lg" label="Carregando opções" />
                </div>
              ) : null}

              {!discoverPickLoading && discoverPickError ? (
                <p className="pick-modal__empty pick-modal__empty--error">{discoverPickError}</p>
              ) : null}

              {!discoverPickLoading && !discoverPickError && pickOptions.length === 0 ? (
                <p className="pick-modal__empty">Sem downloads disponíveis.</p>
              ) : null}

              {!discoverPickLoading && pickOptions.length > 0 ? (
                <>
                  <p className="pick-modal__section-label">Escolha a versão</p>
                  <ul className="pick-modal__options">
                    {pickOptions.map((opt, index) => {
                      const busy = discoverBusy === opt.url
                      const fullTitle = pickOptionLabel(opt)
                      const variant = pickOptionVariantLabel(opt, discoverPickGame.title)
                      const metaLine = pickOptionMetaLine(opt)
                      return (
                        <li key={`${opt.url}-${index}`}>
                          <button
                            type="button"
                            className="pick-modal__option"
                            title={fullTitle}
                            disabled={busy}
                            onClick={() =>
                              void handleEnqueueFromDiscover(
                                opt.title,
                                opt.url,
                                discoverPickGame?.coverUrl,
                              )
                            }
                          >
                            <span className="pick-modal__option-main">
                              <span className="pick-modal__option-variant">{variant}</span>
                              <span className="pick-modal__option-meta">{metaLine}</span>
                            </span>
                            <span className="pick-modal__option-action">
                              {busy ? '…' : 'Baixar'}
                            </span>
                          </button>
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
