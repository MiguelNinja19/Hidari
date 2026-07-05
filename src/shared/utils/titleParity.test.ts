import { describe, expect, it } from 'vitest'
import {
  cleanTitleForCover,
  cleanTitleForDisplay,
  normalizeTitleKey,
} from './normalizeTitleKey'
import { tokenizeTitleForMatching } from './titleMatching'

type TitleCase = {
  input: string
  cleanForMatching: string
  normalizeKey: string
  tokens?: string[]
}

const cases: TitleCase[] = [
  {
    input: 'Galaxy Rangers [FitGirl Repack, Build 1234]',
    cleanForMatching: 'Galaxy Rangers',
    normalizeKey: 'galaxy rangers',
    tokens: ['galaxy', 'rangers'],
  },
  {
    input: 'Pixel Harvest (FitGirl Repack)',
    cleanForMatching: 'Pixel Harvest',
    normalizeKey: 'pixel harvest',
    tokens: ['pixel', 'harvest'],
  },
  {
    input: 'Example Game™',
    cleanForMatching: 'Example Game',
    normalizeKey: 'example game',
    tokens: ['example', 'game'],
  },
]

describe('title parity fixtures', () => {
  for (const row of cases) {
    it(`normaliza "${row.input.slice(0, 40)}..."`, () => {
      const cleaned = cleanTitleForCover(row.input)
      expect(tokenizeTitleForMatching(row.input).join(' ')).toContain(
        row.tokens?.[0] ?? row.normalizeKey.split(' ')[0]!,
      )
      expect(normalizeTitleKey(cleaned || row.input)).toBe(row.normalizeKey)
      expect(cleaned).toBeTruthy()
      expect(cleanTitleForDisplay(row.input)).toBeTruthy()
    })
  }
})
