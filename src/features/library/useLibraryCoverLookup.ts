import { useEffect, useRef } from 'react'
import type { NavTab } from '../../layout/types'
import { LIBRARY_COVER_LOOKUP_DEBOUNCE_MS } from '../../shared/config/polling'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import type { LibraryControllerValue } from './LibraryController'
import type { LibraryEntry } from './types'

export function useLibraryCoverLookup(
  activeTab: NavTab,
  items: LibraryEntry[],
  resolveCover: LibraryControllerValue['resolveCover'],
  resolveCoversBatch: (titles: string[]) => void,
) {
  const attemptedRef = useRef(new Set<string>())
  useEffect(() => {
    if (activeTab !== 'library') return
    const missing = items.map((item) => item.title).filter((title) => {
      const resolved = resolveCover(title)
      if (resolved.coverUrl || resolved.localPath) {
        attemptedRef.current.delete(coverTitleKey(title))
        return false
      }
      return !attemptedRef.current.has(coverTitleKey(title))
    })
    if (missing.length === 0) return
    const timer = window.setTimeout(() => {
      for (const title of missing) attemptedRef.current.add(coverTitleKey(title))
      resolveCoversBatch(missing)
      window.setTimeout(() => {
        for (const title of missing) {
          const resolved = resolveCover(title)
          if (!resolved.coverUrl && !resolved.localPath) {
            attemptedRef.current.delete(coverTitleKey(title))
          }
        }
      }, 8_000)
    }, LIBRARY_COVER_LOOKUP_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [activeTab, items, resolveCover, resolveCoversBatch])
}
