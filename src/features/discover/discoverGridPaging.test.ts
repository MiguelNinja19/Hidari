import { describe, expect, it } from 'vitest'
import {
  clampDiscoverColumns,
  discoverLoadMoreLimit,
  discoverPageSize,
  estimateDiscoverColumns,
} from './discoverGridPaging'

describe('discoverGridPaging', () => {
  it('estima colunas a partir da largura', () => {
    expect(estimateDiscoverColumns(900, 168, 12)).toBe(5)
    expect(estimateDiscoverColumns(1200, 168, 12)).toBe(6)
  })

  it('page size é múltiplo das colunas', () => {
    expect(discoverPageSize(5, 5)).toBe(25)
    expect(discoverPageSize(6, 5)).toBe(30)
  })

  it('load more completa a linha incompleta', () => {
    // 24 jogos com 5 cols → última linha com 4; faltam 1 + 5 linhas = 26
    expect(discoverLoadMoreLimit(24, 5, 5)).toBe(26)
    // 23 com 5 cols → faltam 2 + 25
    expect(discoverLoadMoreLimit(23, 5, 5)).toBe(27)
    // linha já cheia
    expect(discoverLoadMoreLimit(25, 5, 5)).toBe(25)
  })

  it('clamp rejeita valores inválidos', () => {
    expect(clampDiscoverColumns(0)).toBe(5)
    expect(clampDiscoverColumns(99)).toBe(12)
  })
})
