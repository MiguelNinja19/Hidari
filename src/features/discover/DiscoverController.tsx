import { createContext, useContext, type ReactNode } from 'react'
import type { CatalogGame, DownloadOption, Source } from '../../shared/types/contracts'
import type { GetGameDetailInput } from '../../shared/types/contracts'

export type DiscoverControllerValue = {
  discoverSearch: string
  discoverSearchDraft: string
  setDiscoverSearchDraft: (value: string) => void
  submitDiscoverSearch: () => void
  applyDiscoverSearch: (query: string) => void
  catalogLoading: boolean
  catalogLoadingMore: boolean
  catalogHasMore: boolean
  loadMoreCatalog: () => Promise<void>
  displayCatalogSource: CatalogGame[]
  discoverPickGame: CatalogGame | null
  discoverPickLoading: boolean
  discoverPickError: string | null
  discoverPickOptions: DownloadOption[]
  discoverPickSynopsis: string | null
  discoverPickScreenshots: string[]
  discoverBusy: string | null
  enabledSourcesCount: number
  sources: Source[]
  sourcesLoading: boolean
  isSourceEnabled: (sourceId: string) => boolean
  onGoSettings: () => void
  openGameDetail: (input: GetGameDetailInput | CatalogGame) => void
  closeDiscoverPicker: () => void
  handleEnqueueFromDiscover: (title: string, url: string, coverUrl?: string | null) => Promise<void>
  coverCatalogGames: CatalogGame[]
}

const DiscoverControllerContext = createContext<DiscoverControllerValue | null>(null)

export function DiscoverControllerProvider({
  value,
  children,
}: {
  value: DiscoverControllerValue
  children: ReactNode
}) {
  return (
    <DiscoverControllerContext.Provider value={value}>{children}</DiscoverControllerContext.Provider>
  )
}

export function useDiscoverController(): DiscoverControllerValue {
  const ctx = useContext(DiscoverControllerContext)
  if (!ctx) {
    throw new Error('useDiscoverController must be used within DiscoverControllerProvider')
  }
  return ctx
}
