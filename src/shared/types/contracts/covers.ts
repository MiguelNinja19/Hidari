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

export type ResolvedCoverBatchItem = {
  title: string
  coverUrl?: string | null
  localCoverPath?: string | null
}
