import { useCallback, useEffect, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { resolveDiscoverGenreDisplay } from '../../shared/utils/formatGenreLine'

export function useGenreOverrides(titles: string[], enabled: boolean) {
  const [byTitle, setByTitle] = useState<Record<string, string>>({})

  const mergeGenres = useCallback((rows: { title: string; genre: string }[]) => {
    setByTitle((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        const genre = row.genre.trim()
        if (genre && resolveDiscoverGenreDisplay(genre)) {
          next[row.title] = genre
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!enabled || titles.length === 0) return

    const missing = titles.filter((title) => {
      const cached = byTitle[title]
      return !(cached && resolveDiscoverGenreDisplay(cached))
    })
    const toFetch = missing.slice(0, 24)
    if (toFetch.length === 0) return

    let cancelled = false
    void sourcesApi.resolveGameGenresBatch({ titles: toFetch }).then((rows) => {
      if (!cancelled) mergeGenres(rows)
    })

    return () => {
      cancelled = true
    }
  }, [byTitle, enabled, mergeGenres, titles])

  const pickGenre = useCallback(
    (title: string, fallback: string) => {
      const cached = byTitle[title]?.trim()
      if (cached) return cached
      return fallback
    },
    [byTitle],
  )

  return { pickGenre, mergeGenres }
}
