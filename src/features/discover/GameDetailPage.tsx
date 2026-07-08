import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { InlineAlert } from '../../shared/components/InlineAlert'
import { Loader } from '../../shared/components/Loader'
import { Button } from '../../shared/components/ui/Button'
import type { DownloadOption, GameDetail } from '../../shared/types/contracts'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import { resolveDiscoverGenreDisplay } from '../../shared/utils/formatGenreLine'
import { useGenreOverrides } from '../genres/useGenreOverrides'
import {
  dedupeDownloadOptions,
  pickOptionMetaLine,
  pickOptionVariantLabel,
} from '../../shared/utils/pickDownloadOptions'
import type { ResolvedCover } from '../covers/useGameCovers'

type GameDetailPageProps = {
  detail: GameDetail | null
  loading: boolean
  error: string
  discoverBusy: string | null
  isFavorite: boolean
  favoriteBusy: boolean
  onBack: () => void
  onToggleFavorite: () => void
  onEnqueue: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  resolveCover: (
    title: string,
    catalogCoverUrl?: string | null,
    catalogLocalPath?: string | null,
  ) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === 'torrent' ||
  (option.downloadType === 'http' && !option.url.includes('fitgirl-repacks.site/'))

export function GameDetailPage({
  detail,
  loading,
  error,
  discoverBusy,
  isFavorite,
  favoriteBusy,
  onBack,
  onToggleFavorite,
  onEnqueue,
  resolveCover,
  invalidateLocalCover,
}: GameDetailPageProps) {
  const { t } = useTranslation()
  const game = detail?.game ?? null
  const cover = game
    ? resolveCover(game.title, game.coverUrl, game.localCoverPath)
    : null
  const coverUrl = game?.coverUrl?.trim() || cover?.coverUrl || null
  const localPath = game?.localCoverPath?.trim() || cover?.localPath || null

  const downloads = useMemo(() => {
    if (!detail) return []
    return dedupeDownloadOptions(detail.downloads.filter(isDownloadableOption))
  }, [detail])

  const displayTitle = game ? catalogGameDisplayTitle(game.title) : ''
  const needsGenreLookup = Boolean(
    game && !resolveDiscoverGenreDisplay(game.genre ?? ''),
  )
  const { pickGenre } = useGenreOverrides(game ? [game.title] : [], needsGenreLookup)

  const genreEyebrow = useMemo(() => {
    if (!game) return t('common.catalog')
    const direct = resolveDiscoverGenreDisplay(game.genre ?? '')
    if (direct) return direct
    const resolved = resolveDiscoverGenreDisplay(pickGenre(game.title, ''))
    if (resolved) return resolved
    return t('common.catalog')
  }, [game, pickGenre, t])

  return (
    <section className="game-detail">
      <header className="game-detail__toolbar">
        <button
          type="button"
          className="game-detail__back"
          onClick={onBack}
          aria-label={t('gameDetail.back')}
        >
          <span className="game-detail__back-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M10.5 3.5 5.5 8l5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="game-detail__back-label">{t('gameDetail.back')}</span>
        </button>
        {game ? (
          <Button
            type="button"
            variant={isFavorite ? 'primary' : 'outline'}
            disabled={favoriteBusy}
            onClick={() => void onToggleFavorite()}
          >
            {favoriteBusy
              ? '…'
              : isFavorite
                ? `★ ${t('gameDetail.favorited')}`
                : `☆ ${t('gameDetail.favorite')}`}
          </Button>
        ) : null}
      </header>

      {loading ? (
        <div className="game-detail__loading">
          <Loader size="lg" label={t('gameDetail.loading')} />
        </div>
      ) : null}

      {!loading && error ? (
        <InlineAlert className="game-detail__alert" variant="error">
          {error}
        </InlineAlert>
      ) : null}

      {!loading && !error && game ? (
        <>
          <div className="game-detail__hero">
            <div className="game-detail__cover">
              <CatalogCover
                title={game.title}
                coverUrl={coverUrl}
                localPath={localPath}
                cached={Boolean(localPath)}
                status={cover?.status ?? 'idle'}
                priority
                onLocalCoverError={() => invalidateLocalCover(game.title, coverUrl ?? game.coverUrl)}
              />
            </div>
            <div className="game-detail__info">
              <p className="game-detail__eyebrow">{genreEyebrow}</p>
              <h1 className="game-detail__title" title={game.title}>
                {displayTitle}
              </h1>
              {detail?.inLibrary ? (
                <p className="game-detail__badge">{t('gameDetail.inLibrary')}</p>
              ) : null}
              {detail?.synopsis?.trim() ? (
                <p className="game-detail__synopsis">{detail.synopsis.trim()}</p>
              ) : (
                <p className="game-detail__synopsis game-detail__synopsis--muted">
                  {t('gameDetail.noSynopsis')}
                </p>
              )}
            </div>
          </div>

          {detail?.trailerUrl?.trim() ? (
            <div className="game-detail__media">
              <h2 className="game-detail__section-title">{t('gameDetail.trailer')}</h2>
              <div className="game-detail__trailer">
                <video
                  className="game-detail__trailer-video"
                  controls
                  preload="metadata"
                  playsInline
                  poster={detail.trailerThumbnail?.trim() || undefined}
                >
                  <source src={detail.trailerUrl.trim()} type="video/mp4" />
                </video>
              </div>
            </div>
          ) : null}

          <div className="game-detail__downloads">
            <h2 className="game-detail__section-title">{t('gameDetail.downloadsTitle')}</h2>
            {downloads.length === 0 ? (
              <p className="game-detail__empty">{t('gameDetail.noDownloads')}</p>
            ) : (
              <ul className="game-detail__options">
                {downloads.map((opt, index) => {
                  const busy = discoverBusy === opt.url
                  const variant = pickOptionVariantLabel(opt, game.title)
                  const metaLine = pickOptionMetaLine(opt)
                  return (
                    <li key={`${opt.url}-${index}`}>
                      <button
                        type="button"
                        className="game-detail__option"
                        title={opt.title}
                        disabled={busy}
                        onClick={() =>
                          void onEnqueue(opt.title, opt.url, game.coverUrl ?? coverUrl)
                        }
                      >
                        <span className="game-detail__option-main">
                          <span className="game-detail__option-variant">{variant}</span>
                          <span className="game-detail__option-meta">{metaLine}</span>
                        </span>
                        <span className="game-detail__option-action">
                          {busy ? '…' : t('common.download')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {!loading && !error && !game ? (
        <p className="game-detail__empty">{t('gameDetail.notFound')}</p>
      ) : null}
    </section>
  )
}
