import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { GameCover } from '../../shared/types/contracts'
import { findSavedCover } from './coverIndexing'
import { findCatalogCover, isTitleKeyLoading } from './coverLookup'
import type { ResolvedCover } from './coverTypes'

export function useCoverResolve(
  savedCoversRef: MutableRefObject<Record<string, GameCover>>,
  coverByTitleKeyRef: MutableRefObject<
    Map<string, { coverUrl: string; localPath?: string | null }>
  >,
  loadingKeysRef: MutableRefObject<Set<string>>,
) {
  return useCallback(
    (
      title: string,
      catalogCoverUrl?: string | null,
      catalogLocalPath?: string | null,
    ): ResolvedCover => {
      const saved = findSavedCover(title, savedCoversRef.current)
      const catalog = findCatalogCover(title, coverByTitleKeyRef.current)
      const explicitUrl = catalogCoverUrl?.trim() || null
      const coverUrl = explicitUrl || saved?.coverUrl || catalog?.coverUrl || null
      const savedLocalOk =
        Boolean(saved?.localPath?.trim()) &&
        Boolean(coverUrl) &&
        saved!.coverUrl.trim() === coverUrl
      const localPath =
        catalogLocalPath?.trim() ||
        (savedLocalOk ? saved!.localPath ?? null : null) ||
        (catalog?.coverUrl?.trim() === coverUrl ? catalog?.localPath?.trim() || null : null) ||
        null

      if (localPath) {
        return { coverUrl, localPath, status: 'cached' }
      }
      if (coverUrl) {
        return { coverUrl, localPath: null, status: 'idle' }
      }
      if (isTitleKeyLoading(title, loadingKeysRef.current)) {
        return { coverUrl: null, localPath: null, status: 'loading' }
      }
      return { coverUrl: null, localPath: null, status: 'idle' }
    },
    [coverByTitleKeyRef, loadingKeysRef, savedCoversRef],
  )
}
