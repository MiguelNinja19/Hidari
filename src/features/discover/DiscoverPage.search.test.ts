/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Discover results search aggregation', () => {
  it('não filtra resultados por fonte no Discover', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'DiscoverResultsSection.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/sourceFilter/)
    expect(source).not.toMatch(/filteredSearchGames/)
    expect(source).toMatch(/games=\{controller\.displayCatalogSource\}/)
  })
})
