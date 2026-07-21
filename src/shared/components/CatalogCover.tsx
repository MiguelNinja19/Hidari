import { memo, useEffect, useRef } from 'react'
import { useCatalogCoverImage, type CatalogCoverProps } from './useCatalogCoverImage'

function CatalogCoverInner(props: CatalogCoverProps) {
  const { priority = false, status = 'idle' } = props
  const { activeSrc, loaded, failed, committedSrcRef, handleLoad, handleError } =
    useCatalogCoverImage(props)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img || !activeSrc) return
    if (img.complete && img.naturalWidth > 0) handleLoad()
  }, [activeSrc, handleLoad])

  const showImage = Boolean(activeSrc) && !failed
  const showLoaded =
    showImage &&
    (loaded || (committedSrcRef.current != null && activeSrc === committedSrcRef.current))
  const showSkeleton = showImage && !showLoaded

  if (!showImage) {
    const showError = status === 'error' || failed
    return (
      <div className="game-card__media">
        <div
          className={`game-card__cover-empty${showError ? ' game-card__cover-empty--error' : ''}`}
          aria-hidden="true"
        >
          {showError ? <span className="game-card__cover-empty-mark">?</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="game-card__media">
      {!showSkeleton ? null : <div className="game-card__cover-empty" aria-hidden="true" />}
      <img
        ref={imgRef}
        className={`game-card__cover${showLoaded ? ' game-card__cover--loaded' : ''}`}
        src={activeSrc!}
        alt=""
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

export const CatalogCover = memo(CatalogCoverInner, (prev, next) => {
  return (
    prev.title === next.title &&
    prev.coverUrl === next.coverUrl &&
    prev.localPath === next.localPath &&
    prev.cached === next.cached &&
    prev.status === next.status &&
    prev.priority === next.priority
  )
})
