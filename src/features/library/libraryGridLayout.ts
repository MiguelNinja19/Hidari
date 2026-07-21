import { estimateDiscoverColumns } from '../discover/discoverGridPaging'

export const LIBRARY_ROW_GAP = 14
export const LIBRARY_COL_GAP = 12
export const LIBRARY_OVERSCAN_ROWS = 3

export function findLibraryScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY
    if (['auto', 'scroll', 'overlay'].includes(overflowY)) return current
    if (current.classList.contains('main-panel')) return current
    current = current.parentElement
  }
  return null
}

export function measureLibraryColumns(width: number): number {
  if (width <= 0) return 5
  const minCol = width < 720 ? 136 : width < 1024 ? 152 : 168
  return estimateDiscoverColumns(width, minCol, width < 720 ? 10 : LIBRARY_COL_GAP)
}

export function estimateLibraryRowHeight(width: number, columns: number): number {
  const cols = Math.max(1, columns)
  const gap = width < 720 ? 10 : LIBRARY_COL_GAP
  const colWidth = Math.max(120, (width - gap * (cols - 1)) / cols)
  return Math.ceil(colWidth * 1.5 + 36 + LIBRARY_ROW_GAP)
}
