import { useTranslation } from 'react-i18next'
import { DiscoverDetailCarousel } from './DiscoverDetailCarousel'
import { DiscoverDetailAbout } from './DiscoverDetailAbout'

type DiscoverDetailMainProps = {
  loading: boolean
  hasMedia: boolean
  hasSynopsis: boolean
  synopsis: string | null
  shots: string[]
  carouselIndex: number
  activeShot: string | null
  goCarousel: (delta: number) => void
  setCarouselIndex: (index: number) => void
  setLightboxIndex: (index: number | null) => void
}

export function DiscoverDetailMain({
  loading,
  hasMedia,
  hasSynopsis,
  synopsis,
  shots,
  carouselIndex,
  activeShot,
  goCarousel,
  setCarouselIndex,
  setLightboxIndex,
}: DiscoverDetailMainProps) {
  return (
    <div className="discover-detail__main">
      {!loading && hasMedia ? (
        <DiscoverDetailCarousel
          shots={shots}
          carouselIndex={carouselIndex}
          activeShot={activeShot}
          goCarousel={goCarousel}
          setCarouselIndex={setCarouselIndex}
          setLightboxIndex={setLightboxIndex}
        />
      ) : null}
      {!loading && hasSynopsis ? <DiscoverDetailAbout synopsis={synopsis!} /> : null}
    </div>
  )
}

type DiscoverDetailGenresProps = { genres: string[] }

export function DiscoverDetailGenres({ genres }: DiscoverDetailGenresProps) {
  const { t } = useTranslation()
  if (genres.length === 0) return null
  return (
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
  )
}
