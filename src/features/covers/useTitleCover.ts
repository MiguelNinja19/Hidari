import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { coverTitleKeyCandidates } from '../../shared/utils/normalizeTitleKey'
import { useCovers } from './CoversProvider'
import { subscribeCoverKeys } from './coverSubscriptions'
import type { ResolvedCover } from './useGameCovers'

/**
 * Resolve a capa de um título e só re-renderiza este consumidor
 * quando essa capa (ou lookup) muda — não a grelha inteira.
 */
export function useTitleCover(
  title: string,
  catalogCoverUrl?: string | null,
  catalogLocalPath?: string | null,
): ResolvedCover {
  const { resolveCover } = useCovers()
  const [, bump] = useReducer((value: number) => value + 1, 0)
  const keys = useMemo(() => coverTitleKeyCandidates(title), [title])
  const keysSig = keys.join('\0')

  useEffect(() => {
    return subscribeCoverKeys(keys, bump)
    // keysSig captura a identidade estável das chaves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig])

  return resolveCover(title, catalogCoverUrl, catalogLocalPath)
}

export function useStableCoverActions() {
  const { warmCover, invalidateLocalCover, resolveCoversBatch } = useCovers()
  const warmRef = useRef(warmCover)
  const invalidateRef = useRef(invalidateLocalCover)
  const batchRef = useRef(resolveCoversBatch)
  warmRef.current = warmCover
  invalidateRef.current = invalidateLocalCover
  batchRef.current = resolveCoversBatch

  const warm = useCallback((title: string, coverUrl: string) => {
    warmRef.current(title, coverUrl)
  }, [])

  const invalidate = useCallback((title: string, coverUrl?: string | null) => {
    invalidateRef.current(title, coverUrl)
  }, [])

  const resolveBatch = useCallback((titles: string[]) => {
    batchRef.current(titles)
  }, [])

  return { warmCover: warm, invalidateLocalCover: invalidate, resolveCoversBatch: resolveBatch }
}
