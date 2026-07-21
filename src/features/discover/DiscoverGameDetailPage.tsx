import { DiscoverDetailDownloads } from './DiscoverDetailDownloads'
import { DiscoverDetailLightbox } from './DiscoverDetailLightbox'
import { DiscoverDetailGenres, DiscoverDetailMain } from './DiscoverDetailSections'
import { DiscoverDetailHero } from './DiscoverDetailHero'
import { DiscoverDetailToolbar } from './DiscoverDetailToolbar'
import type { DiscoverGameDetailPageProps } from './discoverDetailTypes'
import { useDiscoverDetailPageData } from './useDiscoverDetailPageData'

export type { DiscoverGameDetailPageProps } from './discoverDetailTypes'

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
  const { pageRef, pickOptions, genres, shots, downloadCoverUrl, carousel } = useDiscoverDetailPageData(
    game,
    options,
    screenshots,
    onBack,
  )

  return (
    <section ref={pageRef} className="discover-detail" aria-labelledby="discover-detail-title" tabIndex={-1}>
      <DiscoverDetailToolbar
        favorite={favorite}
        favoriteBusy={favoriteBusy}
        onBack={onBack}
        onToggleFavorite={onToggleFavorite}
      />
      <DiscoverDetailHero title={game.title} />
      <DiscoverDetailMain
        loading={loading}
        hasMedia={shots.length > 0}
        hasSynopsis={Boolean(synopsis?.trim())}
        synopsis={synopsis}
        shots={shots}
        carouselIndex={carousel.carouselIndex}
        activeShot={carousel.activeShot}
        goCarousel={carousel.goCarousel}
        setCarouselIndex={carousel.setCarouselIndex}
        setLightboxIndex={carousel.setLightboxIndex}
      />
      <div className="discover-detail__below">
        <DiscoverDetailGenres genres={genres} />
        <div className="discover-detail__downloads-wrap">
          <DiscoverDetailDownloads
            game={game}
            loading={loading}
            error={error}
            hideDownloads={hideDownloads}
            pickOptions={pickOptions}
            busyUrl={busyUrl}
            downloadCoverUrl={downloadCoverUrl}
            onDownload={onDownload}
          />
          {footerSlot}
        </div>
      </div>
      {carousel.lightboxOpen && carousel.lightboxIndex != null ? (
        <DiscoverDetailLightbox
          shots={shots}
          lightboxIndex={carousel.lightboxIndex}
          setLightboxIndex={carousel.setLightboxIndex}
          setCarouselIndex={carousel.setCarouselIndex}
        />
      ) : null}
    </section>
  )
}
