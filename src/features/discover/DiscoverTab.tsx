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

  const catalogLookupKey = controller.displayCatalogSource
    .slice(0, 24)
    .map((game) => game.id)
    .join('|')

  useEffect(() => {
    if (!catalogLookupKey) return

    const visible = controller.displayCatalogSource.slice(0, 24)
    const missingTitles: string[] = []
    for (const game of visible) {
      if (!game.coverUrl?.trim() && !game.localCoverPath?.trim()) {
        missingTitles.push(game.title)
      }
    }

    if (missingTitles.length > 0) {
      covers.resolveCoversBatch(missingTitles)
    }
  }, [catalogLookupKey, controller.displayCatalogSource, covers.resolveCoversBatch])

  useEffect(() => {
    if (!controller.discoverPickGame?.coverUrl) return
    covers.warmCover(controller.discoverPickGame.title, controller.discoverPickGame.coverUrl)
  }, [controller.discoverPickGame, covers.warmCover])

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
