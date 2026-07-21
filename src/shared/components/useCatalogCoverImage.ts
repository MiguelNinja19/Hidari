import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { buildCoverCandidates } from '../utils/coverCandidates'
import type { CoverStatus } from '../../features/covers/useGameCovers'
import { buildCatalogCoverSources } from './catalogCoverSources'

export type CatalogCoverProps = {
  title: string
  coverUrl?: string | null
  localPath?: string | null
  priority?: boolean
  cached?: boolean
  status?: CoverStatus
  onLocalCoverError?: (title: string) => void
}

export function useCatalogCoverImage({
  title,
  coverUrl,
  localPath,
  onLocalCoverError,
}: CatalogCoverProps) {
  const remoteCandidates = useMemo(() => buildCoverCandidates(coverUrl), [coverUrl])
  const localSrc = useMemo(() => (localPath ? convertFileSrc(localPath) : null), [localPath])
  const [localSkipped, setLocalSkipped] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const committedSrcRef = useRef<string | null>(null)
  const titleKeyRef = useRef(title)
  const coverUrlRef = useRef(coverUrl)
  const reportedLocalErrorRef = useRef(false)
  const sources = useMemo(
    () => buildCatalogCoverSources(localSrc, localSkipped, remoteCandidates),
    [localSrc, localSkipped, remoteCandidates],
  )
  const activeSrc = sources[sourceIndex] ?? null

  useEffect(() => {
    if (titleKeyRef.current === title && coverUrlRef.current === coverUrl) return
    titleKeyRef.current = title
    coverUrlRef.current = coverUrl
    setLocalSkipped(false)
    setSourceIndex(0)
    setLoaded(false)
    setFailed(false)
    committedSrcRef.current = null
    reportedLocalErrorRef.current = false
  }, [title, coverUrl])

  useEffect(() => {
    setLocalSkipped(false)
    reportedLocalErrorRef.current = false
  }, [localPath])

  const handleLoad = useCallback(() => {
    if (activeSrc) committedSrcRef.current = activeSrc
    setLoaded(true)
    setFailed(false)
  }, [activeSrc])

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
      setLoaded(Boolean(committedSrcRef.current))
      return
    }
    if (committedSrcRef.current) {
      setFailed(false)
      setLoaded(true)
      return
    }
    setFailed(true)
    setLoaded(false)
  }, [activeSrc, localSrc, onLocalCoverError, sourceIndex, sources.length, title])

  return { activeSrc, loaded, failed, committedSrcRef, handleLoad, handleError }
}
