import type { MutableRefObject } from 'react'
import type { GameCover } from '../../shared/types/contracts'
import type { ResolvedCover } from './coverTypes'
import { useCoverBatchFlush } from './useCoverBatchFlush'
import { useCoverTitleLookup } from './useCoverTitleLookup'

export function useCoverBatchResolve(
  savedCoversRef: MutableRefObject<Record<string, GameCover>>,
  commitSavedCovers: (
    updater: (prev: Record<string, GameCover>) => Record<string, GameCover>,
    notifyTitles?: string[],
  ) => void,
  refreshCoversRef: MutableRefObject<() => void>,
  resolveCoverRef: MutableRefObject<
    (title: string, catalogCoverUrl?: string | null, catalogLocalPath?: string | null) => ResolvedCover
  >,
  loadingKeysRef: MutableRefObject<Set<string>>,
  enqueueWarm: (title: string, coverUrl: string) => void,
  warmCover: (title: string, coverUrl: string) => void,
) {
  void savedCoversRef
  const resolveCoversBatch = useCoverBatchFlush(
    commitSavedCovers,
    resolveCoverRef,
    loadingKeysRef,
    enqueueWarm,
  )
  const { lookupCoverForTitle, lookupMissingLibraryCover, invalidateLocalCover } =
    useCoverTitleLookup(
      commitSavedCovers,
      refreshCoversRef,
      resolveCoverRef,
      loadingKeysRef,
      warmCover,
      resolveCoversBatch,
    )

  return {
    resolveCoversBatch,
    lookupCoverForTitle,
    lookupMissingLibraryCover,
    invalidateLocalCover,
  }
}
