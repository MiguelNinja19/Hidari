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

/**
 * Remoto primeiro (CDN) para paint estável.
 * Local só como fallback — nunca promove local por cima de um remoto já ok
 * (evita o “tikar” remoto→local).
 */
function buildSourceList(
  localSrc: string | null,
  localSkipped: boolean,
  remoteCandidates: string[],
): string[] {
  const sources: string[] = []
  for (const url of remoteCandidates) {
    if (!sources.includes(url)) sources.push(url)
  }
  if (localSrc && !localSkipped && !sources.includes(localSrc)) {
    sources.push(localSrc)
  }
  return sources
}

function CatalogCoverInner({
  title,
  coverUrl,
  localPath,
  priority = false,
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
  const coverUrlRef = useRef(coverUrl)
  const reportedLocalErrorRef = useRef(false)

  const sources = useMemo(
    () => buildSourceList(localSrc, localSkipped, remoteCandidates),
    [localSrc, localSkipped, remoteCandidates],
  )

  const activeSrc = sources[sourceIndex] ?? null

  useEffect(() => {
    const titleChanged = titleKeyRef.current !== title
    const urlChanged = coverUrlRef.current !== coverUrl
    titleKeyRef.current = title
    coverUrlRef.current = coverUrl
    if (!titleChanged && !urlChanged) return

    setLocalSkipped(false)
    setSourceIndex(0)
    setLoaded(false)
    setFailed(false)
    committedSrcRef.current = null
    reportedLocalErrorRef.current = false
  }, [title, coverUrl])

  useEffect(() => {
    // Novo path local: só reativa fallback; não reinicia se remoto já está ok.
    setLocalSkipped(false)
    reportedLocalErrorRef.current = false
    if (committedSrcRef.current && !committedSrcRef.current.startsWith('asset:')) {
      return
    }
    if (!localSrc) return
    // Se ainda não há remoto commitado e a lista começa no local, ok.
  }, [localPath, localSrc])

  const handleLoad = useCallback(() => {
    if (activeSrc) committedSrcRef.current = activeSrc
    setLoaded(true)
    setFailed(false)
  }, [activeSrc])

  const imgRef = useRef<HTMLImageElement | null>(null)

  // Cache do browser: onLoad pode não disparar → capa ficava opacity:0 (parece sumida).
  useEffect(() => {
    const img = imgRef.current
    if (!img || !activeSrc) return
    if (img.complete && img.naturalWidth > 0) {
      handleLoad()
    }
  }, [activeSrc, sourceIndex, handleLoad])

  const handleError = useCallback(() => {
    if (localSrc && activeSrc === localSrc) {
      setLocalSkipped(true)
      if (!reportedLocalErrorRef.current) {
        reportedLocalErrorRef.current = true
        onLocalCoverError?.(title)
      }
    }

    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((idx) => idx + 1)
      // Mantém a imagem anterior visível enquanto tenta o próximo candidato.
      setLoaded(Boolean(committedSrcRef.current))
      return
    }

    if (committedSrcRef.current) {
      // Já mostrou algo antes — não apaga para “?”.
      setFailed(false)
      setLoaded(true)
      return
    }

    setFailed(true)
    setLoaded(false)
  }, [activeSrc, localSrc, onLocalCoverError, sourceIndex, sources.length, title])

  const showImage = Boolean(activeSrc) && !failed
  const showLoaded =
    showImage &&
    (loaded || (committedSrcRef.current != null && activeSrc === committedSrcRef.current))
  // Skeleton também para remotos — senão a capa fica transparent até onLoad (parece “sem capa”).
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
