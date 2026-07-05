import { useMemo } from 'react'
import { DiscoverNoSources } from './DiscoverNoSources'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { EmptyState } from '../../shared/components/EmptyState'
import { GameTile, GameTileSkeleton } from '../../shared/components/GameTile'
import { Loader } from '../../shared/components/Loader'
import { PageNotice } from '../../shared/components/PageNotice'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import type { CatalogGame, DownloadOption, Source } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import { dedupeDownloadOptions, pickOptionLabel, pickOptionSubtitle } from '../../shared/utils/pickDownloadOptions'

type DiscoverPageProps = {
  discoverSearch: string
  catalogLoading: boolean
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
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  warmCover: (title: string, coverUrl: string) => void
  lookupCoverForTitle: (title: string) => void
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

export function DiscoverPage({
  discoverSearch,
  catalogLoading,
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
  lookupCoverForTitle,
  invalidateLocalCover,
}: DiscoverPageProps) {
  const query = discoverSearch.trim()
  const isSearching = query.length >= 2
  const resultCount = displayCatalogSource.length
  const hasActiveSources = enabledSourcesCount > 0

  const pickCover = discoverPickGame
    ? resolveCover(discoverPickGame.title, discoverPickGame.coverUrl)
    : null
  const pickCoverUrl =
    discoverPickGame?.coverUrl?.trim() || pickCover?.coverUrl || null

  const pickOptions = useMemo(
    () => dedupeDownloadOptions(discoverPickOptions),
    [discoverPickOptions],
  )

  const pageError = discoverPickGame ? null : discoverError || catalogError || null

  return (
    <section
      className={`browse-page${catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''}`}
    >
      <header className="page-toolbar">
        <SearchInput
          value={discoverSearch}
          placeholder={hasActiveSources ? 'Pesquisar…' : 'Ative uma fonte para pesquisar…'}
          disabled={!hasActiveSources}
          onClick={!hasActiveSources ? onGoSettings : undefined}
          onChange={setDiscoverSearch}
          trailing={
            catalogLoading ? (
              <Loader size="sm" className="browse-search__loader" label="Pesquisando" />
            ) : null
          }
        />
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

      {hasActiveSources && isSearching && catalogLoading && resultCount === 0 ? (
        <ul className="library-grid library-grid--skeleton" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <GameTileSkeleton key={index} />
          ))}
        </ul>
      ) : null}

      {hasActiveSources && isSearching && resultCount > 0 ? (
        <ul className="library-grid">
          {displayCatalogSource.map((game, index) => {
            const cover = resolveCover(game.title, game.coverUrl)
            const itemCoverUrl = game.coverUrl?.trim() || cover.coverUrl
            const displayTitle = cleanTitleForDisplay(game.title)

            return (
              <CoverWarmGridItem
                key={`${game.id}:${game.title}`}
                title={game.title}
                coverUrl={itemCoverUrl}
                warmCover={warmCover}
                onNeedsCover={itemCoverUrl ? undefined : lookupCoverForTitle}
                className="library-grid__item"
              >
                <GameTile
                  title={displayTitle}
                  titleAttr={game.title}
                  cover={
                    <CatalogCover
                      title={game.title}
                      coverUrl={itemCoverUrl}
                      localPath={
                        cover.coverUrl === itemCoverUrl || !game.coverUrl?.trim()
                          ? cover.localPath
                          : null
                      }
                      cached={cover.status === 'cached' && cover.coverUrl === itemCoverUrl}
                      status={itemCoverUrl ? cover.status : 'idle'}
                      priority={index < 16}
                      onLocalCoverError={() =>
                        invalidateLocalCover(game.title, itemCoverUrl ?? game.coverUrl)
                      }
                    />
                  }
                  primaryAction={{
                    id: 'download',
                    label: 'Baixar',
                    variant: 'primary',
                    onClick: () => openDiscoverPicker(game),
                  }}
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}

      {hasActiveSources && isSearching && !catalogLoading && resultCount === 0 ? (
        <EmptyState
          title="Sem resultados"
          description={`Não encontramos jogos para "${query}". Tente outro nome ou verifique as fontes ativas.`}
        />
      ) : null}

      {hasActiveSources && !isSearching ? (
        <EmptyState
          title="Explorar jogos"
          description="Digite o nome do jogo na barra de pesquisa (mínimo 2 letras)."
        />
      ) : null}

      {discoverPickGame ? (
        <div
          className="pick-modal-backdrop"
          role="presentation"
          onClick={() => closeDiscoverPicker()}
        >
          <div
            className="pick-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-modal-title"
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
                <h2
                  id="discover-modal-title"
                  className="pick-modal__title"
                  title={discoverPickGame.title}
                >
                  {cleanTitleForDisplay(discoverPickGame.title)}
                </h2>
                {!discoverPickLoading && pickOptions.length > 1 ? (
                  <p className="pick-modal__hint">{pickOptions.length} fontes</p>
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
                <ul className="pick-modal__options">
                  {pickOptions.map((opt, index) => {
                    const busy = discoverBusy === opt.url
                    const subtitle = pickOptionSubtitle(opt)
                    return (
                      <li key={`${opt.url}-${index}`}>
                        <button
                          type="button"
                          className="pick-modal__option"
                          disabled={busy}
                          onClick={() =>
                            void handleEnqueueFromDiscover(
                              opt.title,
                              opt.url,
                              discoverPickGame?.coverUrl,
                            )
                          }
                        >
                          <span className="pick-modal__option-text">
                            <span className="pick-modal__option-label">{pickOptionLabel(opt)}</span>
                            {subtitle ? (
                              <span className="pick-modal__option-source">{subtitle}</span>
                            ) : null}
                          </span>
                          <span className="pick-modal__option-action">
                            {busy ? 'Baixando…' : 'Baixar'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
