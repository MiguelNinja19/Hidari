import { describe, expect, it } from 'vitest'
import {
  buildCoverCandidates,
  coverUrlFromScreenshots,
  extractSteamAppId,
  isLandscapeSteamCoverUrl,
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

describe('isLandscapeSteamCoverUrl', () => {
  it('deteta header e capsule', () => {
    expect(
      isLandscapeSteamCoverUrl(
        'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg',
      ),
    ).toBe(true)
    expect(
      isLandscapeSteamCoverUrl(
        'https://cdn.cloudflare.steamstatic.com/steam/apps/42/library_600x900.jpg',
      ),
    ).toBe(false)
  })
})

describe('buildCoverCandidates', () => {
  it('prioriza library vertical quando a URL é header', () => {
    const url =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/header.jpg'
    const candidates = buildCoverCandidates(url)
    expect(candidates[0]).toContain('library_600x900.jpg')
    expect(candidates[0]).not.toContain('header.jpg')
    expect(candidates).toContain(url)
  })

  it('mantém URL explícita do catálogo à frente', () => {
    const url =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/42/library_600x900.jpg'
    const candidates = buildCoverCandidates(url)
    expect(candidates[0]).toBe(url)
  })

  it('mantém URL não-Steam intacta', () => {
    const url = 'https://example.com/only.jpg'
    expect(buildCoverCandidates(url)).toEqual([url])
  })
})

describe('coverUrlFromScreenshots', () => {
  it('mantém capa existente vertical', () => {
    expect(
      coverUrlFromScreenshots('https://cdn.example/cover.jpg', [
        'https://cdn.example/shot.jpg',
      ]),
    ).toBe('https://cdn.example/cover.jpg')
  })

  it('promove header Steam a library 600x900', () => {
    expect(
      coverUrlFromScreenshots(
        'https://cdn.cloudflare.steamstatic.com/steam/apps/99/header.jpg',
        null,
      ),
    ).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/99/library_600x900.jpg',
    )
  })

  it('usa screenshot quando não há capa', () => {
    expect(coverUrlFromScreenshots(null, ['https://cdn.example/shot.jpg'])).toBe(
      'https://cdn.example/shot.jpg',
    )
  })

  it('prefere library a screenshot quando só há header', () => {
    expect(
      coverUrlFromScreenshots(
        null,
        ['https://cdn.example/shot.jpg'],
        'https://cdn.cloudflare.steamstatic.com/steam/apps/7/header.jpg',
      ),
    ).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/7/library_600x900.jpg',
    )
  })
})
