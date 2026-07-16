import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { estimateDiscoverColumns } from '../discover/discoverGridPaging'
import { LibraryGridCard, type LibraryGridCardModel } from './LibraryGridCard'

const ROW_GAP = 14
const COL_GAP = 12
const OVERSCAN_ROWS = 3
const META_LINE_PX = 36

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
  // capa 2:3 + meta/status
  return Math.ceil(colWidth * 1.5 + META_LINE_PX + ROW_GAP)
}

type VirtualizedLibraryGridProps = {
  models: LibraryGridCardModel[]
  ariaLabel: string
}

export function VirtualizedLibraryGrid({ models, ariaLabel }: VirtualizedLibraryGridProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    setScrollParent(findScrollParent(node))

    const publish = () => setGridWidth(node.clientWidth)
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
  }, [])

  const columns = useMemo(() => measureColumns(gridWidth), [gridWidth])
  const estimatedRowHeight = useMemo(
    () => estimateRowHeight(gridWidth || 800, columns),
    [columns, gridWidth],
  )
  const rowCount = Math.ceil(models.length / Math.max(1, columns))

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimatedRowHeight,
    overscan: OVERSCAN_ROWS,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [estimatedRowHeight, columns, models.length, virtualizer])

  const getItemKey = useCallback(
    (index: number) => models[index]?.item.id ?? index,
    [models],
  )

  const virtualRows = virtualizer.getVirtualItems()
  const colGap = gridWidth < 720 ? 10 : COL_GAP

  return (
    <div
      ref={rootRef}
      className="library-grid library-grid--virtual"
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
        const rowModels = models.slice(startIndex, startIndex + columns)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="library-grid__row"
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
            {rowModels.map((model, colIndex) => (
              <LibraryGridCard
                key={getItemKey(startIndex + colIndex)}
                model={model}
                className="library-grid__item"
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
