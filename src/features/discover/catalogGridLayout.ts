import { estimateDiscoverColumns } from './discoverGridPaging'

export const ROW_GAP = 14
export const COL_GAP = 12
export const OVERSCAN_ROWS = 3

export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
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

export function measureCatalogColumns(width: number): number {
  if (width <= 0) return 5
  const minCol = width < 720 ? 136 : width < 1024 ? 152 : 168
  const gap = width < 720 ? 10 : COL_GAP
  return estimateDiscoverColumns(width, minCol, gap)
}

export function estimateCatalogRowHeight(width: number, columns: number): number {
  const cols = Math.max(1, columns)
  const gap = width < 720 ? 10 : COL_GAP
  const colWidth = Math.max(120, (width - gap * (cols - 1)) / cols)
  return Math.ceil(colWidth * 1.5 + ROW_GAP)
}
