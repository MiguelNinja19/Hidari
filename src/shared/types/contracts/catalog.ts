import type { DownloadOption } from './queue'

export type CatalogGame = {
  id: string
  title: string
  genre: string
  coverUrl?: string | null
  localCoverPath?: string | null
  source: string
  optionCount?: number | null
  groupKey?: string | null
}

export type SearchCatalogInput = {
  query: string
  includeSteam?: boolean
  onlyWithSources?: boolean
  offset?: number
  limit?: number
  attachCovers?: boolean
  /** Local JSON/cache only — fast first paint; omit/false to also query Hydra API. */
  localOnly?: boolean
}

export type ResolvedGenre = {
  title: string
  genre: string
}

export type ResolveGenresBatchInput = {
  titles: string[]
}

export type GetGameDetailInput = {
  groupKey?: string
  title?: string
  /** When false/omitted, skip Steam synopsis (faster picker). */
  includeSteam?: boolean
  /** UI language (`en` / `es` / `ru` / `pt-BR`) for Steam synopsis. */
  language?: string
}

export type GameDetail = {
  game: CatalogGame
  synopsis?: string | null
  screenshots: string[]
  trailerUrl?: string | null
  trailerThumbnail?: string | null
  steamAppId?: number | null
  downloads: DownloadOption[]
  inLibrary: boolean
}

export type DeepLinkPayload = {
  url: string
  gameId?: string | null
  action?: string | null
  searchQuery?: string | null
  groupKey?: string | null
  title?: string | null
}
