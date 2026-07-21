import { useCallback, useEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CatalogGame } from '../../shared/types/contracts'
import { clampDiscoverColumns } from './discoverGridPaging'
import {
  COL_GAP,
  OVERSCAN_ROWS,
  estimateCatalogRowHeight,
  measureCatalogColumns,
} from './catalogGridLayout'
import { VirtualizedCatalogGridRows } from './VirtualizedCatalogGridRows'
import { useCatalogGridMeasurement } from './useCatalogGridMeasurement'

type VirtualizedCatalogGridProps = {
  games: CatalogGame[]
  ariaLabel: string
  isFavorite: (game: CatalogGame) => boolean
  isFavoriteBusy: (game: CatalogGame) => boolean
  onOpen: (game: CatalogGame) => void
  onToggleFavorite: (game: CatalogGame) => void
  onColumnsChange?: (columns: number) => void
  gridRef?: React.Ref<HTMLDivElement>
}

export function VirtualizedCatalogGrid(props: VirtualizedCatalogGridProps) {
  const { games, ariaLabel, isFavorite, isFavoriteBusy, onOpen, onToggleFavorite, onColumnsChange, gridRef } =
    props
  const { setRefs, scrollParent, gridWidth } =
    useCatalogGridMeasurement(gridRef, onColumnsChange)

  const columns = useMemo(() => measureCatalogColumns(gridWidth), [gridWidth])
  const rowHeight = useMemo(
    () => estimateCatalogRowHeight(gridWidth || 800, columns),
    [columns, gridWidth],
  )
  const virtualizer = useVirtualizer({
    count: Math.ceil(games.length / Math.max(1, columns)),
    getScrollElement: () => scrollParent,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN_ROWS,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, columns, games.length, virtualizer])

  return (
    <div
      ref={setRefs}
      className="discover-grid discover-grid--virtual"
      role="list"
      aria-label={ariaLabel}
      style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
    >
      <VirtualizedCatalogGridRows
        virtualRows={virtualizer.getVirtualItems()}
        games={games}
        columns={columns}
        colGap={gridWidth < 720 ? 10 : COL_GAP}
        isFavorite={isFavorite}
        isFavoriteBusy={isFavoriteBusy}
        onOpen={onOpen}
        onToggleFavorite={onToggleFavorite}
        measureElement={virtualizer.measureElement}
      />
    </div>
  )
}

export function useDiscoverGridColumnsState(initial = 5) {
  const [columns, setColumns] = useState(() => clampDiscoverColumns(initial))
  const onColumnsChange = useCallback((next: number) => {
    setColumns(clampDiscoverColumns(next))
  }, [])
  return { columns, onColumnsChange }
}
