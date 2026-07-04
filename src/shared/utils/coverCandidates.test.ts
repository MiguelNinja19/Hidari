import { describe, expect, it } from 'vitest'
import { buildCoverCandidates, extractSteamAppId } from './coverCandidates'

describe('extractSteamAppId', () => {
  it('extrai app id de URL Steam', () => {
    expect(
      extractSteamAppId(
        'https://cdn.cloudflare.steamstatic.com/steam/apps/123456/library_600x900.jpg',
      ),
    ).toBe('123456')
  })

  it('devolve null sem app id', () => {
    expect(extractSteamAppId('https://example.com/cover.jpg')).toBeNull()
    expect(extractSteamAppId(null)).toBeNull()
  })
})

describe('buildCoverCandidates', () => {
  it('inclui variantes Steam e mirror akamai', () => {
    const url =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg'
    const candidates = buildCoverCandidates(url)
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates.some((c) => c.includes('library_600x900.jpg'))).toBe(true)
    expect(candidates.some((c) => c.includes('steamcdn-a.akamaihd.net'))).toBe(true)
  })

  it('deduplica URLs iguais', () => {
    const url = 'https://example.com/only.jpg'
    expect(buildCoverCandidates(url)).toEqual([url])
  })
})
