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
  it('usa só a capa library principal da Steam', () => {
    const url =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg'
    const candidates = buildCoverCandidates(url)
    expect(candidates).toEqual([
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/library_600x900.jpg',
    ])
  })

  it('mantém URL não-Steam intacta', () => {
    const url = 'https://example.com/only.jpg'
    expect(buildCoverCandidates(url)).toEqual([url])
  })
})
