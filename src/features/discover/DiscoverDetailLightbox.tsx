import { useTranslation } from 'react-i18next'
import {
  DiscoverDetailLightboxNav,
  DiscoverDetailLightboxThumbs,
} from './DiscoverDetailLightboxParts'

type DiscoverDetailLightboxProps = {
  shots: string[]
  lightboxIndex: number
  setLightboxIndex: (index: number | null) => void
  setCarouselIndex: (index: number) => void
}

export function DiscoverDetailLightbox({
  shots,
  lightboxIndex,
  setLightboxIndex,
  setCarouselIndex,
}: DiscoverDetailLightboxProps) {
  const { t } = useTranslation()
  const current = shots[lightboxIndex]
  if (!current) return null

  const shift = (delta: number) => {
    const next = (lightboxIndex + delta + shots.length) % shots.length
    setLightboxIndex(next)
    setCarouselIndex(next)
  }

  return (
    <div
      className="discover-detail__lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('discover.pickScreenshots')}
      onClick={() => setLightboxIndex(null)}
    >
      <div className="discover-detail__lightbox-stage" onClick={(event) => event.stopPropagation()}>
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
            <DiscoverDetailLightboxNav
              direction="prev"
              ariaLabel={t('common.back')}
              onClick={() => shift(-1)}
            />
          ) : null}
          <img key={current} className="discover-detail__lightbox-img" src={current} alt="" />
          {shots.length > 1 ? (
            <DiscoverDetailLightboxNav
              direction="next"
              ariaLabel={t('discover.pickScreenshots')}
              onClick={() => shift(1)}
            />
          ) : null}
        </div>

        {shots.length > 1 ? (
          <DiscoverDetailLightboxThumbs
            shots={shots}
            lightboxIndex={lightboxIndex}
            setLightboxIndex={setLightboxIndex}
            setCarouselIndex={setCarouselIndex}
          />
        ) : null}
      </div>
    </div>
  )
}
