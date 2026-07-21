import { useCallback, useMemo } from 'react'
import type { Source } from '../../shared/types/contracts'

export function useDiscoverSources(
  sources: Source[],
  disabledSourceIds: string[],
  disabledSourcesReady: boolean,
) {
  const enabledSourcesCount = useMemo(
    () => disabledSourcesReady
      ? sources.filter((source) => !disabledSourceIds.includes(source.id)).length
      : 0,
    [sources, disabledSourceIds, disabledSourcesReady],
  )
  const enabledSourcesKey = useMemo(
    () => sources
      .filter((source) => !disabledSourceIds.includes(source.id))
      .map((source) => source.id)
      .sort()
      .join('|'),
    [sources, disabledSourceIds],
  )
  const isSourceEnabled = useCallback(
    (sourceId: string) => !disabledSourceIds.includes(sourceId),
    [disabledSourceIds],
  )
  return { enabledSourcesCount, enabledSourcesKey, isSourceEnabled }
}
