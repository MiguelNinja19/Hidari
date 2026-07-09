import { useEffect } from 'react'
import { CoversProvider, useCovers } from '../covers/CoversProvider'
import {
  DiscoverControllerProvider,
  type DiscoverControllerValue,
} from './DiscoverController'
import { DiscoverPage } from './DiscoverPage'
import { useDiscoverControllerState } from './useDiscoverControllerState'
import type { GetGameDetailInput } from '../../shared/types/contracts'

export type DiscoverBridge = {
  applyDiscoverSearch: (query: string) => void
  openGameDetail: (input: GetGameDetailInput) => void
} | null

type DiscoverTabProps = {
  onGoSettings: () => void
  onGoDownloads: () => void
  onRegisterBridge?: (bridge: DiscoverBridge) => void
}

function DiscoverTabInner({
  controller,
  onRegisterBridge,
}: {
  controller: DiscoverControllerValue
  onRegisterBridge?: (bridge: DiscoverBridge) => void
}) {
  const covers = useCovers()

  useEffect(() => {
    onRegisterBridge?.({
      applyDiscoverSearch: controller.applyDiscoverSearch,
      openGameDetail: controller.openGameDetail,
    })
    return () => onRegisterBridge?.(null)
  }, [controller.applyDiscoverSearch, controller.openGameDetail, onRegisterBridge])

  useEffect(() => {
    const visible = controller.displayCatalogSource.slice(0, 80)
    if (visible.length === 0) return

    const titles = visible.map((game) => game.title)
    covers.resolveCoversBatch(titles)

    const directUrls = visible
      .map((game) => {
        const url = game.coverUrl?.trim()
        if (!url) return null
        return { title: game.title, coverUrl: url }
      })
      .filter((item): item is { title: string; coverUrl: string } => item != null)
    if (directUrls.length > 0) {
      covers.warmCovers(directUrls)
    }
  }, [controller.displayCatalogSource, covers])

  useEffect(() => {
    if (!controller.discoverPickGame?.coverUrl) return
    covers.warmCover(controller.discoverPickGame.title, controller.discoverPickGame.coverUrl)
  }, [controller.discoverPickGame, covers])

  return (
    <DiscoverControllerProvider value={controller}>
      <DiscoverPage />
    </DiscoverControllerProvider>
  )
}

export function DiscoverTab({
  onGoSettings,
  onGoDownloads,
  onRegisterBridge,
}: DiscoverTabProps) {
  const controller = useDiscoverControllerState({
    onGoSettings,
    onGoDownloads,
  })

  return (
    <CoversProvider catalogGames={controller.coverCatalogGames}>
      <DiscoverTabInner controller={controller} onRegisterBridge={onRegisterBridge} />
    </CoversProvider>
  )
}
