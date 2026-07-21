import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { GameCover } from '../../shared/types/contracts'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import { notifyCoverTitle } from './coverSubscriptions'
import { INVALIDATE_COOLDOWN_MS, type ResolvedCover } from './coverTypes'

export function useCoverTitleLookup(
  commitSavedCovers: (
    updater: (prev: Record<string, GameCover>) => Record<string, GameCover>,
    notifyTitles?: string[],
  ) => void,
  refreshCoversRef: MutableRefObject<() => void>,
  resolveCoverRef: MutableRefObject<
    (title: string, catalogCoverUrl?: string | null, catalogLocalPath?: string | null) => ResolvedCover
  >,
  loadingKeysRef: MutableRefObject<Set<string>>,
  warmCover: (title: string, coverUrl: string) => void,
  resolveCoversBatch: (titles: string[]) => void,
) {
  const lookupAttemptedRef = useRef(new Set<string>())
  const invalidateAttemptAtRef = useRef(new Map<string, number>())

  const lookupCoverForTitle = useCallback(
    (title: string) => {
      const key = coverTitleKey(title)
      if (loadingKeysRef.current.has(key)) return
      const resolved = resolveCoverRef.current(title)
      if (resolved.localPath || resolved.status === 'cached') return
      if (resolved.coverUrl) {
        warmCover(title, resolved.coverUrl)
        return
      }
      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)
      loadingKeysRef.current.add(key)

      void sourcesApi
        .resolveGameCoverUrl(title)
        .then((url) => {
          if (url?.trim()) {
            commitSavedCovers(
              (prev) => ({
                ...prev,
                [key]: {
                  titleKey: key,
                  coverUrl: url.trim(),
                  localPath: prev[key]?.localPath ?? null,
                },
              }),
              [title],
            )
          } else {
            notifyCoverTitle(title)
          }
        })
        .finally(() => {
          loadingKeysRef.current.delete(key)
          notifyCoverTitle(title)
        })
    },
    [commitSavedCovers, loadingKeysRef, resolveCoverRef, warmCover],
  )

  const lookupMissingLibraryCover = useCallback(
    (title: string) => {
      const resolved = resolveCoverRef.current(title)
      if (resolved.coverUrl || resolved.localPath) return
      const key = coverTitleKey(title)
      if (lookupAttemptedRef.current.has(key)) return
      lookupAttemptedRef.current.add(key)
      resolveCoversBatch([title])
    },
    [resolveCoversBatch, resolveCoverRef],
  )

  const invalidateLocalCover = useCallback(
    (title: string, _coverUrl?: string | null) => {
      const key = coverTitleKey(title)
      const last = invalidateAttemptAtRef.current.get(key) ?? 0
      if (Date.now() - last < INVALIDATE_COOLDOWN_MS) return
      invalidateAttemptAtRef.current.set(key, Date.now())
      void sourcesApi.invalidateGameCoverLocal(title).then(() => refreshCoversRef.current())
    },
    [refreshCoversRef],
  )

  return { lookupCoverForTitle, lookupMissingLibraryCover, invalidateLocalCover }
}
