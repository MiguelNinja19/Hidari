export type Source = {
  id: string
  name: string
  url: string
  status: 'pendingMatching' | 'matching' | 'matched' | 'failed' | string
  downloadCount: number
  fingerprint?: string
  apiSourceId?: string
  remoteUrl?: string
  createdAt: string
}

export type AddSourceInput = {
  url: string
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

export type CatalogChange = {
  sourceId: string
  sourceName: string
  newCount: number
}

export type SearchDownloadOptionsInput = {
  query: string
  groupKey?: string
}
