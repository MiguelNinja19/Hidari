import { describe, expect, it } from 'vitest'
import { cleanTitleForCover, cleanTitleForDisplay, normalizeTitleKey } from './normalizeTitleKey'

describe('normalizeTitleKey', () => {
  it('normaliza título FitGirl para chave estável', () => {
    expect(normalizeTitleKey('Mega Man X Legacy Collection [FitGirl Repack]')).toBe(
      'mega man x legacy collection fitgirl',
    )
  })

  it('limita a seis palavras', () => {
    expect(normalizeTitleKey('One Two Three Four Five Six Seven Eight')).toBe(
      'one two three four five six',
    )
  })

  it('remove marcas registadas', () => {
    expect(normalizeTitleKey('Hades™ II')).toContain('hades')
  })
})

describe('cleanTitleForDisplay', () => {
  it('remove builds e DLCs do título FitGirl', () => {
    expect(
      cleanTitleForDisplay(
        'Mega Man Battle Network Legacy Collection: Vol. 1 + 2, Builds 12489466/21550575 + 3 DLCs/Bonuses',
      ),
    ).toBe('Mega Man Battle Network Legacy Collection: Vol. 1 + 2')
  })
})

describe('cleanTitleForCover', () => {
  it('remove repack e parênteses para pesquisa Steam', () => {
    expect(cleanTitleForCover('Stardew Valley (v1.6 - FitGirl Repack)')).toBe('Stardew Valley')
  })

  it('remove tags entre colchetes', () => {
    expect(cleanTitleForCover('Cyberpunk 2077 [DODI Repack]')).toBe('Cyberpunk 2077')
  })
})
