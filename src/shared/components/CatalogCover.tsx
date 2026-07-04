import { useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { buildCoverCandidates } from '../utils/coverCandidates'
import type { CoverStatus } from '../../features/covers/useGameCovers'

export function CatalogCover({
  title,
  coverUrl,
  localPath,
  priority = false,
  cached = false,
  status = 'idle',
  onLocalCoverError,
}: {
  title: string
  coverUrl?: string | null
  localPath?: string | null
  priority?: boolean
  cached?: boolean
  status?: CoverStatus
  onLocalCoverError?: (title: string) => void
}) {
  const remoteCandidates = useMemo(() => buildCoverCandidates(coverUrl), [coverUrl])
  const localSrc = useMemo(
    () => (localPath ? convertFileSrc(localPath) : null),
    [localPath],
  )

  const [localSkipped, setLocalSkipped] = useState(false)
  const [remoteIndex, setRemoteIndex] = useState(0)
  const [remoteRetry, setRemoteRetry] = useState(0)
  const [displaySrc, setDisplaySrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const visibleSrcRef = useRef<string | null>(null)

  const effectiveLocal = localSkipped ? null : localSrc
  const remoteSrcBase = remoteCandidates[remoteIndex]
  const remoteSrc =
    remoteSrcBase && remoteRetry > 0
      ? `${remoteSrcBase}${remoteSrcBase.includes('?') ? '&' : '?'}retry=${remoteRetry}`
      : remoteSrcBase

  useEffect(() => {
    setLocalSkipped(false)
    setRemoteIndex(0)
    setRemoteRetry(0)
    setDisplaySrc(null)
    setLoaded(false)
    setFailed(false)
    visibleSrcRef.current = null
  }, [title, coverUrl])

  useEffect(() => {
    if (visibleSrcRef.current && loaded) {
      if (effectiveLocal && effectiveLocal !== visibleSrcRef.current) {
        const probe = new Image()
        probe.onload = () => {
          visibleSrcRef.current = effectiveLocal
          setDisplaySrc(effectiveLocal)
          setLoaded(true)
        }
        probe.onerror = () => {
          setLocalSkipped(true)
          onLocalCoverError?.(title)
        }
        probe.src = effectiveLocal
      }
      return
    }

    const nextSrc = effectiveLocal ?? remoteSrc ?? null
    if (!nextSrc) {
      setDisplaySrc(null)
      setLoaded(false)
      setFailed(false)
      return
    }

    setDisplaySrc(nextSrc)
    setLoaded(Boolean(cached && effectiveLocal === nextSrc))
    setFailed(false)
  }, [cached, effectiveLocal, loaded, onLocalCoverError, remoteSrc, title])

  const showLoaded =
    !failed &&
    (loaded ||
      (cached && effectiveLocal != null && displaySrc === effectiveLocal) ||
      (visibleSrcRef.current != null && displaySrc === visibleSrcRef.current))

  if (!displaySrc || failed) {
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
        className={`game-card__cover${showLoaded ? ' game-card__cover--loaded' : ''}${cached && effectiveLocal && displaySrc === effectiveLocal ? ' game-card__cover--cached' : ''}`}
        src={displaySrc}
        alt=""
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => {
          visibleSrcRef.current = displaySrc
          setLoaded(true)
          setFailed(false)
        }}
        onError={() => {
          if (effectiveLocal && displaySrc === effectiveLocal) {
            setLocalSkipped(true)
            visibleSrcRef.current = null
            if (remoteSrc) {
              setDisplaySrc(remoteSrc)
              setLoaded(false)
              onLocalCoverError?.(title)
              return
            }
            onLocalCoverError?.(title)
            setFailed(true)
            setLoaded(false)
            return
          }

          if (remoteIndex + 1 < remoteCandidates.length) {
            const nextCandidate = remoteCandidates[remoteIndex + 1]
            setRemoteIndex((idx) => idx + 1)
            if (nextCandidate) {
              setDisplaySrc(nextCandidate)
            }
            setLoaded(false)
            return
          }

          if (remoteRetry < 2 && remoteCandidates.length > 0) {
            setRemoteRetry((value) => value + 1)
            setRemoteIndex(0)
            setLoaded(false)
            return
          }

          setFailed(true)
          setLoaded(false)
          visibleSrcRef.current = null
        }}
      />
    </div>
  )
}
