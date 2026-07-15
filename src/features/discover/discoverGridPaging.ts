/** Colunas razoáveis para a grelha Discover (minmax ~168px). */
export function clampDiscoverColumns(columns: number): number {
  if (!Number.isFinite(columns) || columns < 1) return 5
  return Math.max(1, Math.min(12, Math.floor(columns)))
}

/** Estimativa quando ainda não há itens (casa com CSS minmax). */
export function estimateDiscoverColumns(
  containerWidth: number,
  minColPx = 168,
  gapPx = 12,
): number {
  if (containerWidth <= 0) return 5
  return clampDiscoverColumns(
    Math.floor((containerWidth + gapPx) / (minColPx + gapPx)),
  )
}

/** Conta quantos cards cabem na primeira linha real da grelha. */
export function countDiscoverColumnsFromGrid(container: HTMLElement): number | null {
  const items = container.querySelectorAll<HTMLElement>(':scope > .discover-grid__item')
  if (items.length === 0) return null
  const firstTop = items[0]!.offsetTop
  let cols = 0
  for (const item of items) {
    if (item.offsetTop !== firstTop) break
    cols += 1
  }
  return cols > 0 ? clampDiscoverColumns(cols) : null
}

export function resolveDiscoverColumns(container: HTMLElement | null): number {
  if (!container) return 5
  const fromDom = countDiscoverColumnsFromGrid(container)
  if (fromDom != null) return fromDom
  // Breakpoints CSS baixam o min — usa 152 como compromisso se a janela for média.
  const width = container.clientWidth
  const minCol = width < 720 ? 136 : width < 1024 ? 152 : 168
  const gap = width < 720 ? 10 : 12
  return estimateDiscoverColumns(width, minCol, gap)
}

/** Jogos por pedido inicial: N linhas cheias. */
export function discoverPageSize(columns: number, fullRows = 5): number {
  const cols = clampDiscoverColumns(columns)
  return cols * Math.max(1, fullRows)
}

/**
 * No scroll: completa a linha incompleta (2–3 que “faltam”) + N linhas cheias.
 * Assim o layout não fica com resto irregular.
 */
export function discoverLoadMoreLimit(
  currentCount: number,
  columns: number,
  fullRows = 5,
): number {
  const cols = clampDiscoverColumns(columns)
  const rem = currentCount % cols
  const toCompleteRow = rem === 0 ? 0 : cols - rem
  return toCompleteRow + cols * Math.max(1, fullRows)
}
