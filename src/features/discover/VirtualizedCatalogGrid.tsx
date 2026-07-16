import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CatalogGame } from '../../shared/types/contracts'
import { clampDiscoverColumns, estimateDiscoverColumns } from './discoverGridPaging'
import { CatalogGridCard } from './CatalogGridCard'

const ROW_GAP = 14
const COL_GAP = 12
const OVERSCAN_ROWS = 3

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null
  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return current
    }
    if (current.classList.contains('main-panel')) return current
    current = current.parentElement
  }
  return null
}

function measureColumns(width: number): number {
  if (width <= 0) return 5
  const minCol = width < 720 ? 136 : width < 1024 ? 152 : 168
  const gap = width < 720 ? 10 : COL_GAP
  return estimateDiscoverColumns(width, minCol, gap)
}

function estimateRowHeight(width: number, columns: number): number {
  const cols = Math.max(1, columns)
  const gap = width < 720 ? 10 : COL_GAP
  const colWidth = Math.max(120, (width - gap * (cols - 1)) / cols)
  // aspect-ratio 2/3 → height = width * 1.5
  return Math.ceil(colWidth * 1.5 + ROW_GAP)
}

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

export function VirtualizedCatalogGrid({
  games,
  ariaLabel,
  isFavorite,
  isFavoriteBusy,
  onOpen,
  onToggleFavorite,
  onColumnsChange,
  gridRef,
}: VirtualizedCatalogGridProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      if (typeof gridRef === 'function') gridRef(node)
      else if (gridRef && 'current' in gridRef) {
        ;(gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }
    },
    [gridRef],
  )

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    setScrollParent(findScrollParent(node))

    const publish = () => {
      const width = node.clientWidth
      setGridWidth(width)
      onColumnsChange?.(measureColumns(width))
    }
    publish()

    let frame = 0
    const observer = new ResizeObserver(() => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        publish()
      })
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [onColumnsChange])

  const columns = useMemo(() => measureColumns(gridWidth), [gridWidth])
  const rowHeight = useMemo(
    () => estimateRowHeight(gridWidth || 800, columns),
    [columns, gridWidth],
  )
  const rowCount = Math.ceil(games.length / Math.max(1, columns))

  const virtualizer = useVirtualizer({
    count: rowCount,
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

  const virtualRows = virtualizer.getVirtualItems()
  const colGap = gridWidth < 720 ? 10 : COL_GAP

  return (
    <div
      ref={setRefs}
      className="discover-grid discover-grid--virtual"
      role="list"
      aria-label={ariaLabel}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualRows.map((row) => {
        const startIndex = row.index * columns
        const rowGames = games.slice(startIndex, startIndex + columns)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
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
            {rowGames.map((game, colIndex) => {
              const absoluteIndex = startIndex + colIndex
              return (
                <CatalogGridCard
                  key={game.id}
                  game={game}
                  priority={absoluteIndex < columns * 2}
                  favorite={isFavorite(game)}
                  favoriteBusy={isFavoriteBusy(game)}
                  onOpen={onOpen}
                  onToggleFavorite={onToggleFavorite}
                  className="discover-grid__item"
                />
              )
            })}
          </div>
        )
      })}
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
