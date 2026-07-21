import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LibraryGridCardModel } from './LibraryGridCard'
import {
  LIBRARY_COL_GAP,
  LIBRARY_OVERSCAN_ROWS,
  estimateLibraryRowHeight,
  findLibraryScrollParent,
  measureLibraryColumns,
} from './libraryGridLayout'
import { VirtualizedLibraryRows } from './VirtualizedLibraryRows'

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
    setScrollParent(findLibraryScrollParent(node))

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

  const columns = useMemo(() => measureLibraryColumns(gridWidth), [gridWidth])
  const estimatedRowHeight = useMemo(
    () => estimateLibraryRowHeight(gridWidth || 800, columns),
    [columns, gridWidth],
  )
  const rowCount = Math.ceil(models.length / Math.max(1, columns))

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimatedRowHeight,
    overscan: LIBRARY_OVERSCAN_ROWS,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [estimatedRowHeight, columns, models.length, virtualizer])

  const virtualRows = virtualizer.getVirtualItems()
  const colGap = gridWidth < 720 ? 10 : LIBRARY_COL_GAP

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
      <VirtualizedLibraryRows
        rows={virtualRows}
        models={models}
        columns={columns}
        colGap={colGap}
        virtualizer={virtualizer}
      />
    </div>
  )
}
