import { CatalogCover } from '../../shared/components/CatalogCover'
import { Button } from '../../shared/components/ui/Button'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'

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

function sourceBadge(game: CatalogGame): string {
  const label = game.genre?.trim()
  if (!label) return 'Fonte'
  return label.length > 14 ? `${label.slice(0, 12)}…` : label
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

  return (
    <section
      className={`browse-page${catalogLoading && resultCount > 0 ? ' browse-page--loading' : ''}`}
    >
      <header className="page-toolbar">
        <div className="browse-search browse-search--bar">
          <span className="browse-search__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
          </span>
          <input
            className="browse-search__input"
            type="search"
            placeholder="Pesquisar…"
            value={discoverSearch}
            onChange={(event) => setDiscoverSearch(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={!hasActiveSources}
            onClick={!hasActiveSources ? onGoSettings : undefined}
          />
          {catalogLoading ? (
            <span className="browse-search__spinner" aria-label="A pesquisar" />
          ) : null}
        </div>
      </header>

      {discoverError && !discoverPickGame ? (
        <p className="browse-note browse-note--error">{discoverError}</p>
      ) : null}

      {catalogError && !discoverPickGame ? (
        <p className="browse-note browse-note--error">{catalogError}</p>
      ) : null}

      {!hasActiveSources ? (
        <div className="browse-idle">
          <p className="browse-idle__text">Nenhuma fonte ativa.</p>
          <button className="btn btn-outline btn--compact" type="button" onClick={onGoSettings}>
            Config
          </button>
        </div>
      ) : null}

      {hasActiveSources && isSearching && catalogLoading && resultCount === 0 ? (
        <ul className="library-grid library-grid--skeleton" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <li key={index} className="library-card library-card--skeleton">
              <div className="library-card__cover library-card__cover--skeleton" />
              <div className="library-card__foot">
                <div className="library-card__title library-card__title--skeleton" />
                <div className="library-card__cta library-card__cta--skeleton" />
              </div>
            </li>
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
                className="library-card"
              >
                <div className="library-card__cover">
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
                  <span className="library-card__badge">{sourceBadge(game)}</span>
                </div>

                <div className="library-card__foot">
                  <h3 className="library-card__title" title={game.title}>
                    {displayTitle}
                  </h3>
                  <Button
                    variant="primary"
                    size="compact"
                    className="library-card__cta btn-flat"
                    type="button"
                    onClick={() => openDiscoverPicker(game)}
                  >
                    Baixar
                  </Button>
                </div>
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}

      {hasActiveSources && isSearching && !catalogLoading && resultCount === 0 ? (
        <div className="browse-idle">
          <p className="browse-idle__text">Sem resultados.</p>
        </div>
      ) : null}

      {discoverPickGame ? (
        <div
          className="discover-modal-backdrop"
          role="presentation"
          onClick={() => closeDiscoverPicker()}
        >
          <div
            className="pick-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pick-sheet__head">
              <div className="pick-sheet__cover">
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
              <p
                id="discover-modal-title"
                className="pick-sheet__title"
                title={discoverPickGame.title}
              >
                {cleanTitleForDisplay(discoverPickGame.title)}
              </p>
              <button
                type="button"
                className="pick-sheet__close"
                onClick={() => closeDiscoverPicker()}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {discoverPickLoading ? (
              <div className="pick-sheet__loading">
                <span className="browse-search__spinner" aria-hidden="true" />
              </div>
            ) : null}

            {!discoverPickLoading && discoverPickError ? (
              <p className="browse-note browse-note--error pick-sheet__note">{discoverPickError}</p>
            ) : null}

            {discoverError && discoverPickGame ? (
              <p className="browse-note browse-note--error pick-sheet__note">{discoverError}</p>
            ) : null}

            {!discoverPickLoading && discoverPickOptions.length > 0 ? (
              <ul className="pick-sheet__list">
                {discoverPickOptions.map((opt, index) => (
                  <li key={`${opt.url}-${index}`} className="pick-sheet__row">
                    <span className="pick-sheet__source">
                      {opt.sourceName}
                      <span className="pick-sheet__type">
                        {opt.downloadType === 'torrent' ? 'Torrent' : opt.downloadType}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="pick-sheet__action"
                      disabled={discoverBusy === opt.url}
                      onClick={() =>
                        void handleEnqueueFromDiscover(
                          opt.title,
                          opt.url,
                          discoverPickGame?.coverUrl,
                        )
                      }
                    >
                      {discoverBusy === opt.url ? '…' : 'Baixar'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
