import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import type { CatalogGame } from '../../shared/types/contracts'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import { useStableCoverActions, useTitleCover } from '../covers/useTitleCover'
import { DiscoverGameCard } from './DiscoverGameCard'

type CatalogGridCardProps = {
  game: CatalogGame
  priority?: boolean
  favorite: boolean
  favoriteBusy: boolean
  onOpen: (game: CatalogGame) => void
  onToggleFavorite: (game: CatalogGame) => void
  className?: string
}

export const CatalogGridCard = memo(function CatalogGridCard({
  game,
  priority = false,
  favorite,
  favoriteBusy,
  onOpen,
  onToggleFavorite,
  className = 'discover-grid__item',
}: CatalogGridCardProps) {
  const { t } = useTranslation()
  const { warmCover, invalidateLocalCover, resolveCoversBatch } = useStableCoverActions()
  const cover = useTitleCover(game.title, game.coverUrl, game.localCoverPath)

  const catalogUrl = game.coverUrl?.trim() || null
  const itemCoverUrl = catalogUrl || cover.coverUrl
  const itemLocalPath =
    (cover.localPath && (!catalogUrl || cover.coverUrl === catalogUrl)
      ? cover.localPath
      : null) ||
    game.localCoverPath?.trim() ||
    null
  const displayTitle = catalogGameDisplayTitle(game.title)
  const hasCover = cover.status !== 'error' && Boolean(itemLocalPath || itemCoverUrl)

  const handleOpen = useCallback(() => {
    onOpen(game)
  }, [game, onOpen])

  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite(game)
  }, [game, onToggleFavorite])

  const handleNeedsCover = useCallback(
    (title: string) => {
      resolveCoversBatch([title])
    },
    [resolveCoversBatch],
  )

  const handleLocalCoverError = useCallback(() => {
    invalidateLocalCover(game.title, itemCoverUrl ?? game.coverUrl)
  }, [game.coverUrl, game.title, invalidateLocalCover, itemCoverUrl])

  return (
    <CoverWarmGridItem
      title={game.title}
      coverUrl={itemCoverUrl}
      warmCover={warmCover}
      onNeedsCover={handleNeedsCover}
      className={className}
    >
      <DiscoverGameCard
        title={displayTitle}
        titleAttr={game.title}
        genre=""
        showTitle={!hasCover}
        cover={
          <CatalogCover
            title={game.title}
            coverUrl={itemCoverUrl}
            localPath={itemLocalPath}
            cached={Boolean(itemLocalPath)}
            status={cover.status}
            priority={priority}
            onLocalCoverError={handleLocalCoverError}
          />
        }
        actionLabel={t('discover.viewSources')}
        onOpen={handleOpen}
        favorite={favorite}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={handleToggleFavorite}
      />
    </CoverWarmGridItem>
  )
})
