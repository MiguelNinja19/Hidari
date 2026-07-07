import { describe, expect, it } from 'vitest'

/** Lógica de paginação Discover (espelha useDiscoverCatalog). */
function sliceCatalogPage(rows: unknown[], pageSize: number) {
  return {
    games: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  }
}

describe('useDiscoverCatalog pagination', () => {
  it('detecta hasMore quando há mais que pageSize', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ id: String(index) }))
    const page = sliceCatalogPage(rows, 24)
    expect(page.games).toHaveLength(24)
    expect(page.hasMore).toBe(true)
  })

  it('hasMore false quando resultados cabem numa página', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ id: String(index) }))
    const page = sliceCatalogPage(rows, 24)
    expect(page.games).toHaveLength(10)
    expect(page.hasMore).toBe(false)
  })
})
