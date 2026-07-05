import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { buildCoverCandidates } from '../utils/coverCandidates'
import type { CoverStatus } from '../../features/covers/useGameCovers'

type CatalogCoverProps = {
  title: string
  coverUrl?: string | null
  localPath?: string | null
  priority?: boolean
  cached?: boolean
  status?: CoverStatus
  onLocalCoverError?: (title: string) => void
}

function buildSourceList(
  localSrc: string | null,
  localSkipped: boolean,
  remoteCandidates: string[],
): string[] {
  const sources: string[] = []
  if (localSrc && !localSkipped) sources.push(localSrc)
  for (const url of remoteCandidates) {
    if (!sources.includes(url)) sources.push(url)
  }
  return sources
}

function CatalogCoverInner({
  title,
  coverUrl,
  localPath,
  priority = false,
  cached = false,
  status = 'idle',
  onLocalCoverError,
}: CatalogCoverProps) {
  const remoteCandidates = useMemo(() => buildCoverCandidates(coverUrl), [coverUrl])
  const localSrc = useMemo(
    () => (localPath ? convertFileSrc(localPath) : null),
    [localPath],
  )

  const [localSkipped, setLocalSkipped] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const committedSrcRef = useRef<string | null>(null)
  const titleKeyRef = useRef(title)

  const sources = useMemo(
    () => buildSourceList(localSrc, localSkipped, remoteCandidates),
    [localSrc, localSkipped, remoteCandidates],
  )

  const activeSrc = sources[sourceIndex] ?? null
  const isCachedLocal = Boolean(cached && localSrc && activeSrc === localSrc)

  useEffect(() => {
    if (titleKeyRef.current === title) return
    titleKeyRef.current = title
    setLocalSkipped(false)
    setSourceIndex(0)
    setLoaded(false)
    setFailed(false)
    committedSrcRef.current = null
  }, [title])

  useEffect(() => {
    setLocalSkipped(false)
    setSourceIndex(0)
  }, [localPath])

  useEffect(() => {
    if (!localSrc || localSkipped) return
    if (sources[0] !== localSrc) return
    if (sourceIndex === 0 && activeSrc === localSrc && (loaded || isCachedLocal)) return

    if (cached || isCachedLocal) {
      setSourceIndex(0)
      setLoaded(true)
      setFailed(false)
      committedSrcRef.current = localSrc
      return
    }

    const probe = new Image()
    probe.onload = () => {
      setSourceIndex(0)
      setLoaded(true)
      setFailed(false)
      committedSrcRef.current = localSrc
    }
    probe.onerror = () => {
      setLocalSkipped(true)
      onLocalCoverError?.(title)
    }
    probe.src = localSrc
  }, [
    activeSrc,
    cached,
    isCachedLocal,
    loaded,
    localSkipped,
    localSrc,
    onLocalCoverError,
    sourceIndex,
    sources,
    title,
  ])

  const handleLoad = useCallback(() => {
    if (activeSrc) committedSrcRef.current = activeSrc
    setLoaded(true)
    setFailed(false)
  }, [activeSrc])

  const handleError = useCallback(() => {
    if (localSrc && activeSrc === localSrc) {
      setLocalSkipped(true)
      onLocalCoverError?.(title)
      if (sourceIndex + 1 < sources.length) {
        setSourceIndex((idx) => idx + 1)
        setLoaded(Boolean(committedSrcRef.current))
        return
      }
    }

    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((idx) => idx + 1)
      setLoaded(Boolean(committedSrcRef.current))
      return
    }

    setFailed(true)
    setLoaded(false)
    committedSrcRef.current = null
  }, [activeSrc, localSrc, onLocalCoverError, sourceIndex, sources.length, title])

  const showImage = Boolean(activeSrc) && !failed
  const showLoaded =
    showImage &&
    (loaded ||
      isCachedLocal ||
      (committedSrcRef.current != null && activeSrc === committedSrcRef.current))

  if (!showImage) {
    return (
      <div className="game-card__media">
        <div
          className={`game-card__placeholder${status === 'error' || failed ? ' game-card__placeholder--error' : ''}`}
          aria-hidden="true"
        >
          <span>{status === 'error' || failed ? '?' : title.slice(0, 2).toUpperCase()}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="game-card__media">
      {!showLoaded ? <div className="game-card__cover-skeleton" aria-hidden="true" /> : null}
      <img
        className={`game-card__cover${showLoaded ? ' game-card__cover--loaded' : ''}${isCachedLocal ? ' game-card__cover--cached' : ''}`}
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
