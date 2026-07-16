import { describe, expect, it } from 'vitest'
import {
  favoriteCatalogKeyForEntry,
  favoriteCatalogKeyForGame,
  isUsableFavoriteCatalogKey,
} from './favoriteCatalogKey'

describe('favoriteCatalogKey', () => {
  it('rejeita ids de UI source:emb_', () => {
    expect(isUsableFavoriteCatalogKey('source:emb_79d89bd2bd100549')).toBe(false)
    expect(isUsableFavoriteCatalogKey('emb_79d89bd2bd100549')).toBe(false)
  })

  it('usa groupKey real do jogo', () => {
    expect(
      favoriteCatalogKeyForGame({
        title: 'Stardew Valley',
        groupKey: 'Stardew Valley',
        id: 'source:emb_79d89bd2bd100549',
      }),
    ).toBe('Stardew Valley')
  })

  it('repara entradas antigas pelo título', () => {
    const key = favoriteCatalogKeyForEntry('Stardew Valley', 'source:emb_79d89bd2bd100549')
    expect(isUsableFavoriteCatalogKey(key)).toBe(true)
    expect(key.toLowerCase()).toContain('stardew')
  })
})
