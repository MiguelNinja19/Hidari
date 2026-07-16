import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../../shared/components/Spinner'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import {
  dedupeDownloadOptions,
  pickOptionLabel,
  pickOptionMeta,
  pickOptionVariantLabel,
} from '../../shared/utils/pickDownloadOptions'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'
import { parseGenreList } from '../genres/parseGenreList'
import { coverUrlFromScreenshots } from '../../shared/utils/coverCandidates'

const MAX_SHOTS = 8
const MAX_GENRES = 8

type DiscoverGameDetailPageProps = {
  game: CatalogGame
  loading: boolean
  error: string | null
  options: DownloadOption[]
  synopsis: string | null
  screenshots: string[]
  busyUrl: string | null
  favorite: boolean
  favoriteBusy: boolean
  onToggleFavorite: () => void
  onBack: () => void
  onDownload?: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  /** Conteúdo extra sob os downloads (ex.: notas na biblioteca). */
  footerSlot?: ReactNode
  hideDownloads?: boolean
}

export function DiscoverGameDetailPage({
  game,
  loading,
  error,
  options,
  synopsis,
  screenshots,
  busyUrl,
  favorite,
  favoriteBusy,
  onToggleFavorite,
  onBack,
  onDownload,
  footerSlot,
  hideDownloads = false,
}: DiscoverGameDetailPageProps) {
  const { t } = useTranslation()
  const pageRef = useRef<HTMLElement>(null)

  const displayTitle = catalogGameDisplayTitle(game.title)

  const pickOptions = useMemo(() => dedupeDownloadOptions(options), [options])
  const genres = useMemo(() => parseGenreList(game.genre).slice(0, MAX_GENRES), [game.genre])
  const shots = useMemo(
    () => screenshots.filter((url) => url.trim().length > 0).slice(0, MAX_SHOTS),
    [screenshots],
  )
  const downloadCoverUrl = useMemo(
    () => coverUrlFromScreenshots(game.coverUrl, shots),
    [game.coverUrl, shots],
  )
  const hasSynopsis = Boolean(synopsis?.trim())
  const hasMedia = shots.length > 0

  const [carouselIndex, setCarouselIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxOpen = lightboxIndex != null && shots[lightboxIndex] != null
  const activeShot = shots[Math.min(carouselIndex, Math.max(shots.length - 1, 0))] ?? null

  useEffect(() => {
    setCarouselIndex(0)
    setLightboxIndex(null)
  }, [game.id])

  useEffect(() => {
    if (carouselIndex >= shots.length) {
      setCarouselIndex(0)
    }
  }, [carouselIndex, shots.length])

  const goCarousel = (delta: number) => {
    if (shots.length <= 1) return
    setCarouselIndex((index) => (index + delta + shots.length) % shots.length)
  }

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true })
    const panel = pageRef.current?.closest('.main-panel')
    if (panel instanceof HTMLElement) {
      panel.scrollTop = 0
    }
  }, [game.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightboxIndex != null) {
          setLightboxIndex(null)
          return
        }
        onBack()
        return
      }
      if (shots.length <= 1) return
      if (lightboxIndex != null) {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          const next = (lightboxIndex + 1) % shots.length
          setLightboxIndex(next)
          setCarouselIndex(next)
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          const next = (lightboxIndex - 1 + shots.length) % shots.length
          setLightboxIndex(next)
          setCarouselIndex(next)
        }
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setCarouselIndex((index) => (index + 1) % shots.length)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setCarouselIndex((index) => (index - 1 + shots.length) % shots.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, onBack, shots.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lightboxOpen])

  return (
    <section
      ref={pageRef}
      className="discover-detail"
      aria-labelledby="discover-detail-title"
      tabIndex={-1}
    >
      <header className="discover-detail__toolbar">
        <button type="button" className="discover-detail__back" onClick={onBack}>
          <span className="discover-detail__back-arrow" aria-hidden="true">
            ←
          </span>
          {t('common.back')}
        </button>
        <button
          type="button"
          className={`discover-detail__favorite${favorite ? ' discover-detail__favorite--on' : ''}${favoriteBusy ? ' is-busy' : ''}`}
          aria-pressed={favorite}
          aria-label={favorite ? t('discover.removeFavorite') : t('discover.addFavorite')}
          title={favorite ? t('discover.removeFavorite') : t('discover.addFavorite')}
          disabled={favoriteBusy}
          onClick={onToggleFavorite}
        >
          {favoriteBusy ? (
            <span className="discover-detail__favorite-spinner" aria-hidden="true" />
          ) : (
            <svg
              className="discover-detail__favorite-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          )}
        </button>
      </header>

      <header className="discover-detail__hero">
        <h1 id="discover-detail-title" className="discover-detail__title" title={game.title}>
          {displayTitle}
        </h1>
      </header>

      <div className="discover-detail__main">
        {!loading && hasMedia && activeShot ? (
          <div className="discover-detail__media">
            <div
              className="discover-detail__carousel"
              aria-label={t('discover.pickScreenshots')}
              aria-roledescription="carousel"
            >
              <div className="discover-detail__carousel-frame">
                {shots.length > 1 ? (
                  <button
                    type="button"
                    className="discover-detail__carousel-nav discover-detail__carousel-nav--prev"
                    aria-label={t('common.back')}
                    onClick={() => goCarousel(-1)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M10 3L5 8l5 5" />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="discover-detail__shot"
                  onClick={() => setLightboxIndex(carouselIndex)}
                  aria-label={`${t('discover.pickScreenshots')} ${carouselIndex + 1}`}
                >
                  <img
                    key={activeShot}
                    src={activeShot}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                {shots.length > 1 ? (
                  <button
                    type="button"
                    className="discover-detail__carousel-nav discover-detail__carousel-nav--next"
                    aria-label={t('discover.pickScreenshots')}
                    onClick={() => goCarousel(1)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </button>
                ) : null}
                {shots.length > 1 ? (
                  <span className="discover-detail__carousel-count" aria-hidden="true">
                    {carouselIndex + 1} / {shots.length}
                  </span>
                ) : null}
              </div>
              {shots.length > 1 ? (
                <div className="discover-detail__carousel-thumbs" role="tablist">
                  {shots.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      role="tab"
                      aria-selected={index === carouselIndex}
                      aria-label={`${t('discover.pickScreenshots')} ${index + 1}`}
                      className={
                        index === carouselIndex
                          ? 'discover-detail__carousel-thumb is-active'
                          : 'discover-detail__carousel-thumb'
                      }
                      onClick={() => setCarouselIndex(index)}
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && hasSynopsis ? (
          <section className="discover-detail__about" aria-labelledby="discover-detail-about-label">
            <p id="discover-detail-about-label" className="discover-detail__about-label">
              {t('discover.pickAbout')}
            </p>
            <p className="discover-detail__synopsis">{synopsis}</p>
          </section>
        ) : null}
      </div>

      <div className="discover-detail__below">
        {genres.length > 0 ? (
          <div className="discover-detail__categories">
            <p id="discover-detail-categories" className="discover-detail__categories-label">
              {t('discover.pickCategories')}
            </p>
            <ul className="discover-detail__genres" aria-labelledby="discover-detail-categories">
              {genres.map((genre) => (
                <li key={genre} className="discover-detail__genre">
                  {genre}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="discover-detail__downloads-wrap">
          {hideDownloads && loading ? (
            <div className="discover-detail__loading">
              <Spinner size="md" label={t('common.loadingTab')} />
            </div>
          ) : null}

          {!hideDownloads && loading ? (
            <div className="discover-detail__loading">
              <Spinner size="md" label={t('discover.loadingOptions')} />
              <p className="discover-detail__loading-label">{t('discover.loadingOptions')}</p>
            </div>
          ) : null}

          {!loading && error ? (
            <p className="discover-detail__empty discover-detail__empty--error">{error}</p>
          ) : null}

          {!hideDownloads && !loading && !error && pickOptions.length === 0 ? (
            <p className="discover-detail__empty">{t('discover.noDownloadsAvailable')}</p>
          ) : null}

          {!hideDownloads && !loading && pickOptions.length > 0 && onDownload ? (
            <section className="discover-detail__downloads" aria-label={t('discover.pickVersion')}>
              <div className="discover-detail__downloads-head">
                <p className="discover-detail__section-label">{t('discover.pickVersion')}</p>
                <span className="discover-detail__count">{pickOptions.length}</span>
              </div>
              <ul className="discover-detail__options">
                {pickOptions.map((opt, index) => {
                  const busy = busyUrl === opt.url
                  const fullTitle = pickOptionLabel(opt)
                  const variant = pickOptionVariantLabel(opt, game.title)
                  const meta = pickOptionMeta(opt)
                  return (
                    <li key={`${opt.url}-${index}`}>
                      <div className="discover-detail__option" title={fullTitle}>
                        <span className="discover-detail__option-main">
                          <span className="discover-detail__option-variant">{variant}</span>
                          <span className="discover-detail__option-meta">
                            <span>{meta.source}</span>
                            {meta.size ? <span>{meta.size}</span> : null}
                            <span>{meta.downloadType}</span>
                          </span>
                        </span>
                        <button
                          type="button"
                          className="discover-detail__option-action"
                          disabled={busy}
                          onClick={() => void onDownload(opt.title, opt.url, downloadCoverUrl)}
                        >
                          {busy ? '…' : t('common.download')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {footerSlot}
        </div>
      </div>

      {lightboxOpen ? (
        <div
          className="discover-detail__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('discover.pickScreenshots')}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="discover-detail__lightbox-stage"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="discover-detail__lightbox-close"
              aria-label={t('common.close')}
              onClick={() => setLightboxIndex(null)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>

            <div className="discover-detail__lightbox-viewport">
              {shots.length > 1 ? (
                <button
                  type="button"
                  className="discover-detail__lightbox-nav discover-detail__lightbox-nav--prev"
                  aria-label={t('common.back')}
                  onClick={() => {
                    const current = lightboxIndex ?? 0
                    const next = (current - 1 + shots.length) % shots.length
                    setLightboxIndex(next)
                    setCarouselIndex(next)
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M10 3L5 8l5 5" />
                  </svg>
                </button>
              ) : null}

              <img
                key={shots[lightboxIndex!]!}
                className="discover-detail__lightbox-img"
                src={shots[lightboxIndex!]!}
                alt=""
              />

              {shots.length > 1 ? (
                <button
                  type="button"
                  className="discover-detail__lightbox-nav discover-detail__lightbox-nav--next"
                  aria-label={t('discover.pickScreenshots')}
                  onClick={() => {
                    const current = lightboxIndex ?? 0
                    const next = (current + 1) % shots.length
                    setLightboxIndex(next)
                    setCarouselIndex(next)
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </button>
              ) : null}
            </div>

            {shots.length > 1 ? (
              <div className="discover-detail__lightbox-footer">
                <span className="discover-detail__lightbox-count">
                  {lightboxIndex! + 1} / {shots.length}
                </span>
                <div className="discover-detail__lightbox-thumbs" role="tablist">
                  {shots.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      role="tab"
                      aria-selected={index === lightboxIndex}
                      aria-label={`${t('discover.pickScreenshots')} ${index + 1}`}
                      className={
                        index === lightboxIndex
                          ? 'discover-detail__lightbox-thumb is-active'
                          : 'discover-detail__lightbox-thumb'
                      }
                      onClick={() => {
                        setLightboxIndex(index)
                        setCarouselIndex(index)
                      }}
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
