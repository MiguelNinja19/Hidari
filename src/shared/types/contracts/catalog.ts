import type { DownloadOption } from './queue'

export type CatalogGame = {
  id: string
  title: string
  genre: string
  coverUrl?: string | null
  localCoverPath?: string | null
  source: string
  optionCount?: number | null
}

export type SearchCatalogInput = {
  query: string
  includeSteam?: boolean
  onlyWithSources?: boolean
  offset?: number
  limit?: number
  attachCovers?: boolean
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

export type FavoriteEntry = {
  catalogKey: string
  title: string
  addedAt: string
}

export type ToggleFavoriteInput = {
  catalogKey: string
  title: string
}

export type Collection = {
  id: string
  name: string
  entryCount: number
}

export type CollectionEntry = {
  catalogKey: string
  title: string
}

export type CreateCollectionInput = {
  name: string
}

export type RenameCollectionInput = {
  id: string
  name: string
}

export type CollectionIdInput = {
  id: string
}

export type CollectionEntryInput = {
  collectionId: string
  catalogKey: string
  title: string
}

export type GameSourceChange = {
  gameId: number
  newDownloadOptionsCount: number
}

export type DeepLinkPayload = {
  url: string
  gameId?: string | null
  action?: string | null
  searchQuery?: string | null
  groupKey?: string | null
  title?: string | null
}
