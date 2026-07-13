import { describe, expect, it } from 'vitest'
import {
  buildCoverCandidates,
  coverUrlFromScreenshots,
  extractSteamAppId,
} from './coverCandidates'

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
  it('prioriza library e inclui header como fallback', () => {
    const url =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg'
    const candidates = buildCoverCandidates(url)
    expect(candidates[0]).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/library_600x900.jpg',
    )
    expect(candidates).toContain(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg',
    )
  })

  it('mantém URL não-Steam intacta', () => {
    const url = 'https://example.com/only.jpg'
    expect(buildCoverCandidates(url)).toEqual([url])
  })
})

describe('coverUrlFromScreenshots', () => {
  it('mantém capa existente', () => {
    expect(
      coverUrlFromScreenshots('https://cdn.example/cover.jpg', [
        'https://cdn.example/shot.jpg',
      ]),
    ).toBe('https://cdn.example/cover.jpg')
  })

  it('usa screenshot quando não há capa', () => {
    expect(coverUrlFromScreenshots(null, ['https://cdn.example/shot.jpg'])).toBe(
      'https://cdn.example/shot.jpg',
    )
  })

  it('prefere header a screenshot', () => {
    expect(
      coverUrlFromScreenshots(
        null,
        ['https://cdn.example/shot.jpg'],
        'https://cdn.example/header.jpg',
      ),
    ).toBe('https://cdn.example/header.jpg')
  })
})
