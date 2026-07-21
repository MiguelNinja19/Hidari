import { useTranslation } from 'react-i18next'

type LightboxNavProps = {
  direction: 'prev' | 'next'
  ariaLabel: string
  onClick: () => void
}

export function DiscoverDetailLightboxNav({ direction, ariaLabel, onClick }: LightboxNavProps) {
  return (
    <button
      type="button"
      className={`discover-detail__lightbox-nav discover-detail__lightbox-nav--${direction}`}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={direction === 'prev' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
      </svg>
    </button>
  )
}

type LightboxThumbsProps = {
  shots: string[]
  lightboxIndex: number
  setLightboxIndex: (index: number | null) => void
  setCarouselIndex: (index: number) => void
}

export function DiscoverDetailLightboxThumbs({
  shots,
  lightboxIndex,
  setLightboxIndex,
  setCarouselIndex,
}: LightboxThumbsProps) {
  const { t } = useTranslation()
  return (
    <div className="discover-detail__lightbox-footer">
      <span className="discover-detail__lightbox-count">
        {lightboxIndex + 1} / {shots.length}
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
  )
}
