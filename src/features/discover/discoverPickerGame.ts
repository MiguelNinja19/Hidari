import type { Dispatch, SetStateAction } from 'react'
import type { CatalogGame } from '../../shared/types/contracts'
import { coverUrlFromScreenshots } from '../../shared/utils/coverCandidates'
import { catalogDedupeKey } from './discoverCatalogGames'

export function applyPickerEnrichment(
  selected: CatalogGame,
  enriched: Partial<CatalogGame>,
  screenshots: string[],
  setGame: Dispatch<SetStateAction<CatalogGame | null>>,
  setCatalogGames: Dispatch<SetStateAction<CatalogGame[]>>,
) {
  const nextCover =
    coverUrlFromScreenshots(enriched.coverUrl ?? selected.coverUrl, screenshots) ?? null
  setGame((previous) => previous ? {
    ...previous,
    title: enriched.title?.trim() || previous.title,
    genre: enriched.genre?.trim() || previous.genre,
    coverUrl: nextCover ?? previous.coverUrl,
    groupKey: enriched.groupKey ?? previous.groupKey,
  } : previous)
  if (nextCover && !selected.coverUrl?.trim()) {
    const key = catalogDedupeKey(selected)
    setCatalogGames((games) => games.map((row) =>
      catalogDedupeKey(row) === key
        ? { ...row, coverUrl: row.coverUrl?.trim() || nextCover }
        : row,
    ))
  }
}
