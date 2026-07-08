export type AppPaths = {
  appDataDir: string
  appConfigDir: string
  appCacheDir: string
}

export type Source = {
  id: string
  name: string
  url: string
  status: 'pendingMatching' | 'matching' | 'matched' | 'failed' | string
  downloadCount: number
  fingerprint?: string
  apiSourceId?: string
  createdAt: string
}

export type AddSourceInput = {
  url: string
}

export type SourceTestResult = {
  sourceId: string
  ok: boolean
  statusCode?: number
  latencyMs: number
  message: string
}

export type SyncLocalSourceResult = {
  sourceId: string
  downloadCount: number
  warning?: string | null
}

export type SyncLocalSourceFailure = {
  sourceId: string
  sourceName: string
  message: string
}

export type SyncAllLocalSourcesResult = {
  synced: SyncLocalSourceResult[]
  failures: SyncLocalSourceFailure[]
  unchangedCount: number
}

export type DownloadJob = {
  id: string
  title: string
  url: string
  destPath: string
  status:
    | 'pending'
    | 'downloading'
    | 'seeding'
    | 'retrying'
    | 'paused'
    | 'completed'
    | 'extracting'
    | 'extracted'
    | 'failed'
    | 'cancelled'
    | string
  priority: number
  progress: number
  bytesDownloaded: number
  totalBytes: number
  speedBps?: number
  etaSeconds?: number
  seedEnabled?: boolean
  errorMsg: string | null
  /** Estado da extração/verificação (ex.: verified, verify_failed). */
  extractionStatus?: string | null
  createdAt: string
  updatedAt: string
}

export type EnqueueJobInput = {
  title: string
  url: string
  destPath?: string
  priority?: number
  coverUrl?: string | null
}

export type CoverPrecacheStatus = {
  running: boolean
  total: number
  processed: number
  cached: number
  downloaded: number
  unresolved: number
  failed: number
}

export type GameCover = {
  titleKey: string
  coverUrl: string
  localPath?: string | null
}

export type SteamAppIndexStatus = {
  totalApps: number
  lastUpdatedAt: number | null
  refreshing: boolean
}

export type LibraryPathState = {
  /** @deprecated use hasGame — mantido para compatibilidade */
  playable: boolean
  hasGame: boolean
  needsInstall: boolean
  installPath?: string | null
  needsExtraction: boolean
  /** Pasta de instalação escolhida manualmente (fora da pasta de download). */
  customGameRoot?: string | null
}

export type JobProgressEvent = {
  jobId: string
  progress: number
  status: string
  speedBytesPerSec: number
  etaSeconds: number
  bytesDownloaded?: number
  totalBytes?: number
}

export type ExtractStatusEvent = {
  jobId: string
  status:
    | 'extracting'
    | 'extracted'
    | 'failed'
    | 'skipped'
    | 'verified'
    | 'verify_failed'
    | string
  message?: string | null
}

export type GameSourceChange = {
  gameId: number
  newDownloadOptionsCount: number
}

export type DownloadOption = {
  sourceId: string
  sourceName: string
  title: string
  downloadType: 'http' | 'torrent' | string
  url: string
  quality: string
  coverUrl?: string | null
}

export type DeepLinkPayload = {
  url: string
  gameId?: string | null
  action?: string | null
  searchQuery?: string | null
  groupKey?: string | null
  title?: string | null
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

export type CatalogChange = {
  sourceId: string
  sourceName: string
  newCount: number
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

export type SearchDownloadOptionsInput = {
  query: string
}

export type CatalogGame = {
  id: string
  title: string
  genre: string
  coverUrl?: string | null
  localCoverPath?: string | null
  source: string
  optionCount?: number | null
}

export type ResolvedCoverBatchItem = {
  title: string
  coverUrl?: string | null
  localCoverPath?: string | null
}

export type SearchCatalogInput = {
  query: string
  includeSteam?: boolean
  onlyWithSources?: boolean
  offset?: number
  limit?: number
  /** false = pesquisa rápida sem resolver capas no backend */
  attachCovers?: boolean
}

export type ResolvedGenre = {
  title: string
  genre: string
}

export type ResolveGenresBatchInput = {
  titles: string[]
}

export type InspectLibraryPathInput = {
  key: string
  title: string
  path: string
  jobId?: string
}

export type InspectLibraryPathResult = {
  key: string
  state: LibraryPathState
}

export type LocalLibraryItem = {
  name: string
  path: string
  isDir: boolean
  sizeBytes: number
  modifiedAt: number
}
