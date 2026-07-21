import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame } from '../../shared/types/contracts'

const searchCatalog = (
  query: string,
  localOnly: boolean,
  attachCovers: boolean,
  limit: number,
  offset = 0,
) =>
  sourcesApi.searchGameCatalog({
    query,
    includeSteam: false,
    onlyWithSources: true,
    attachCovers,
    localOnly,
    offset,
    limit,
  })

export async function searchCachedCatalog(query: string, limit: number) {
  return searchCatalog(query, true, true, limit)
}

export async function searchFreshCatalog(query: string, limit: number, offset = 0) {
  return searchCatalog(query, false, offset > 0, limit, offset)
}

export type CatalogSearchState = {
  catalogGames: CatalogGame[]
  catalogLoading: boolean
  catalogLoadingMore: boolean
  catalogHasMore: boolean
}
