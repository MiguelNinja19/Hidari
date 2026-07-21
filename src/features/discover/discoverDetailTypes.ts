import type { ReactNode } from 'react'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'

export const MAX_DETAIL_SHOTS = 8
export const MAX_DETAIL_GENRES = 8

export type DiscoverGameDetailPageProps = {
  game: CatalogGame
  loading: boolean
  error: string | null
  options: DownloadOption[]
  synopsis: string | null
  screenshots: string[]
  busyUrl: string | null
  favorite: boolean
  favoriteBusy: boolean
  onToggleFavorite: () => void
  onBack: () => void
  onDownload?: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  footerSlot?: ReactNode
  hideDownloads?: boolean
}
