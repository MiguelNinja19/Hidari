import type { Key, Ref } from 'react'
import type { CatalogGame } from '../../shared/types/contracts'
import { CatalogGridCard } from './CatalogGridCard'
import { ROW_GAP } from './catalogGridLayout'

type VirtualizedCatalogGridRowsProps = {
  virtualRows: Array<{ key: Key; index: number; start: number }>
  games: CatalogGame[]
  columns: number
  colGap: number
  isFavorite: (game: CatalogGame) => boolean
  isFavoriteBusy: (game: CatalogGame) => boolean
  onOpen: (game: CatalogGame) => void
  onToggleFavorite: (game: CatalogGame) => void
  measureElement: Ref<HTMLDivElement>
}

export function VirtualizedCatalogGridRows({
  virtualRows,
  games,
  columns,
  colGap,
  isFavorite,
  isFavoriteBusy,
  onOpen,
  onToggleFavorite,
  measureElement,
}: VirtualizedCatalogGridRowsProps) {
  return (
    <>
      {virtualRows.map((row) => {
        const startIndex = row.index * columns
        const rowGames = games.slice(startIndex, startIndex + columns)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={measureElement}
            className="discover-grid__row"
            role="presentation"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: `${ROW_GAP}px ${colGap}px`,
              alignItems: 'start',
              paddingBottom: ROW_GAP,
              boxSizing: 'border-box',
            }}
          >
            {rowGames.map((game, colIndex) => (
              <CatalogGridCard
                key={game.id}
                game={game}
                priority={startIndex + colIndex < columns * 2}
                favorite={isFavorite(game)}
                favoriteBusy={isFavoriteBusy(game)}
                onOpen={onOpen}
                onToggleFavorite={onToggleFavorite}
                className="discover-grid__item"
              />
            ))}
          </div>
        )
      })}
    </>
  )
}
