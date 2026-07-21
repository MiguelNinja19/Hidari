import { useEffect, useMemo, useRef } from 'react'
import { dedupeDownloadOptions } from '../../shared/utils/pickDownloadOptions'
import { coverUrlFromScreenshots } from '../../shared/utils/coverCandidates'
import { parseGenreList } from '../genres/parseGenreList'
import { MAX_DETAIL_GENRES, MAX_DETAIL_SHOTS } from './discoverDetailTypes'
import { useDiscoverDetailCarousel } from './useDiscoverDetailCarousel'

export function useDiscoverDetailPageData(
  game: { id: string; title: string; genre: string; coverUrl?: string | null },
  options: Parameters<typeof dedupeDownloadOptions>[0],
  screenshots: string[],
  onBack: () => void,
) {
  const pageRef = useRef<HTMLElement>(null)
  const pickOptions = useMemo(() => dedupeDownloadOptions(options), [options])
  const genres = useMemo(() => parseGenreList(game.genre).slice(0, MAX_DETAIL_GENRES), [game.genre])
  const shots = useMemo(
    () => screenshots.filter((url) => url.trim().length > 0).slice(0, MAX_DETAIL_SHOTS),
    [screenshots],
  )
  const downloadCoverUrl = useMemo(
    () => coverUrlFromScreenshots(game.coverUrl, shots),
    [game.coverUrl, shots],
  )
  const carousel = useDiscoverDetailCarousel(shots, game.id, onBack)

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true })
    const panel = pageRef.current?.closest('.main-panel')
    if (panel instanceof HTMLElement) panel.scrollTop = 0
  }, [game.id])

  return { pageRef, pickOptions, genres, shots, downloadCoverUrl, carousel }
}
