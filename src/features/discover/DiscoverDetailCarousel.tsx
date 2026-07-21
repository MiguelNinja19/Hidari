import { useTranslation } from 'react-i18next'

type DiscoverDetailCarouselProps = {
  shots: string[]
  carouselIndex: number
  activeShot: string | null
  goCarousel: (delta: number) => void
  setCarouselIndex: (index: number) => void
  setLightboxIndex: (index: number | null) => void
}

export function DiscoverDetailCarousel({
  shots,
  carouselIndex,
  activeShot,
  goCarousel,
  setCarouselIndex,
  setLightboxIndex,
}: DiscoverDetailCarouselProps) {
  const { t } = useTranslation()
  if (!activeShot) return null

  return (
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
            <img key={activeShot} src={activeShot} alt="" loading="lazy" decoding="async" />
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
  )
}
