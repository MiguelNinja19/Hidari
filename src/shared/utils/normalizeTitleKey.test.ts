import { describe, expect, it } from 'vitest'
import {
  catalogGameDisplayTitle,
  cleanTitleForCover,
  cleanTitleForDisplay,
  coverTitleKey,
  normalizeTitleKey,
} from './normalizeTitleKey'

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

describe('catalogGameDisplayTitle', () => {
  it('remove sufixo de versão V + números', () => {
    expect(catalogGameDisplayTitle('Eldest Souls V1 0 466')).toBe('Eldest Souls')
    expect(catalogGameDisplayTitle('Some Game v2.0.1')).toBe('Some Game')
    expect(catalogGameDisplayTitle('Terraria V1 4 4 1 Labor of Love')).toBe('Terraria')
    expect(catalogGameDisplayTitle('Terraria v1.4.4.1 - Labor of Love Update')).toBe(
      'Terraria',
    )
  })
})

describe('cleanTitleForDisplay', () => {
  it('remove sufixo de versão V + números', () => {
    expect(cleanTitleForDisplay('Eldest Souls V1 0 466')).toBe('Eldest Souls')
    expect(cleanTitleForDisplay('Terraria V1 4 4 1 Labor of Love')).toBe('Terraria')
  })

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

describe('coverTitleKey', () => {
  it('ignora repack e versão na chave de capa', () => {
    expect(coverTitleKey('Eldest Souls V1 0 466 [FitGirl Repack]')).toBe('eldest souls')
    expect(coverTitleKey('Terraria V1 4 4 1 Labor of Love')).toBe('terraria')
  })
})
