import { useEffect, useMemo, useRef } from 'react'
import type { CatalogGame } from '../../shared/types/contracts'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
export type { CoverStatus, ResolvedCover } from './coverTypes'
import { useCoverBatchResolve } from './useCoverBatchResolve'
import { useCoverResolve } from './useCoverResolve'
import { useCoverSavedSync } from './useCoverSavedSync'
import { useCoverWarmActions } from './useCoverWarmActions'

export function useGameCovers(catalogGames: CatalogGame[], options?: { eager?: boolean }) {
  const loadingKeysRef = useRef(new Set<string>())
  const { savedCoversRef, commitSavedCovers, refreshCovers, refreshCoversRef, patchSavedCover } =
    useCoverSavedSync(options)

  const coverByTitleKey = useMemo(() => {
    const map = new Map<string, { coverUrl: string; localPath?: string | null }>()
    for (const game of catalogGames) {
      const coverUrl = game.coverUrl?.trim()
      const localPath = game.localCoverPath?.trim()
      if (!coverUrl && !localPath) continue
      map.set(coverTitleKey(game.title), {
        coverUrl: coverUrl ?? '',
        localPath: localPath ?? null,
      })
    }
    return map
  }, [catalogGames])

  const coverByTitleKeyRef = useRef(coverByTitleKey)
  useEffect(() => {
    coverByTitleKeyRef.current = coverByTitleKey
  }, [coverByTitleKey])

  const patchSavedCoverRef = useRef(patchSavedCover)
  useEffect(() => {
    patchSavedCoverRef.current = patchSavedCover
  }, [patchSavedCover])

  const resolveCover = useCoverResolve(savedCoversRef, coverByTitleKeyRef, loadingKeysRef)
  const resolveCoverRef = useRef(resolveCover)
  useEffect(() => {
    resolveCoverRef.current = resolveCover
  }, [resolveCover])

  const { enqueueWarm, warmCover, warmCovers, syncJobCovers } = useCoverWarmActions(
    savedCoversRef,
    coverByTitleKey,
    refreshCoversRef,
    patchSavedCoverRef,
  )

  const {
    resolveCoversBatch,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  } = useCoverBatchResolve(
    savedCoversRef,
    commitSavedCovers,
    refreshCoversRef,
    resolveCoverRef,
    loadingKeysRef,
    enqueueWarm,
    warmCover,
  )

  return useMemo(
    () => ({
      resolveCover,
      warmCover,
      warmCovers,
      refreshCovers,
      syncJobCovers,
      resolveCoversBatch,
      lookupCoverForTitle,
      lookupMissingLibraryCover,
      invalidateLocalCover,
    }),
    [
      resolveCover,
      warmCover,
      warmCovers,
      refreshCovers,
      syncJobCovers,
      resolveCoversBatch,
      lookupCoverForTitle,
      lookupMissingLibraryCover,
      invalidateLocalCover,
    ],
  )
}
