import { useCallback, useEffect, useRef, useState } from 'react'
import { findScrollParent, measureCatalogColumns } from './catalogGridLayout'

export function useCatalogGridMeasurement(
  gridRef?: React.Ref<HTMLDivElement>,
  onColumnsChange?: (columns: number) => void,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    if (typeof gridRef === 'function') gridRef(node)
    else if (gridRef && 'current' in gridRef) {
      ;(gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    }
  }, [gridRef])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    setScrollParent(findScrollParent(node))
    const publish = () => {
      const width = node.clientWidth
      setGridWidth(width)
      onColumnsChange?.(measureCatalogColumns(width))
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

  return { setRefs, scrollParent, gridWidth }
}
