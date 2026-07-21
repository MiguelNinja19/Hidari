import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'
import { coverUrlFromScreenshots } from '../../shared/utils/coverCandidates'
import { cleanTitleForCover } from '../../shared/utils/normalizeTitleKey'
import { simplifySourceSearchQuery } from '../../shared/utils/titleMatching'

export type DiscoverPickPayload = {
  downloadable: DownloadOption[]
  synopsis: string | null
  screenshots: string[]
  enrichedGame: Partial<CatalogGame> | null
}

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === 'torrent' ||
  (option.downloadType === 'http' && !option.url.includes('fitgirl-repacks.site/'))

export async function fetchDownloadOptionsForGame(
  game: CatalogGame,
  language?: string,
): Promise<DiscoverPickPayload> {
  const groupKey = game.groupKey?.trim() || undefined
  const title = game.title.trim()
  let synopsis: string | null = null
  let screenshots: string[] = []
  let enrichedGame: Partial<CatalogGame> | null = null

  if (groupKey || title) {
    try {
      const detail = await sourcesApi.getGameDetail({
        groupKey,
        title: title || undefined,
        includeSteam: true,
        language,
      })
      synopsis = detail.synopsis?.trim() || null
      screenshots = detail.screenshots.filter((url) => url.trim().length > 0)
      enrichedGame = {
        title: detail.game.title || undefined,
        genre: detail.game.genre || undefined,
        coverUrl: coverUrlFromScreenshots(detail.game.coverUrl, screenshots) ?? undefined,
        groupKey: detail.game.groupKey ?? undefined,
      }
      const downloadable = detail.downloads.filter(isDownloadableOption)
      if (downloadable.length > 0) {
        return { downloadable, synopsis, screenshots, enrichedGame }
      }
    } catch {
      // Continua com a pesquisa por título.
    }
  }

  const queries = [
    cleanTitleForCover(title),
    simplifySourceSearchQuery(cleanTitleForCover(title)),
  ].filter((query, index, all) => query.length >= 2 && all.indexOf(query) === index)

  for (const query of queries) {
    const rows = await sourcesApi.searchDownloadOptions({ query, groupKey })
    const downloadable = rows.filter(isDownloadableOption)
    if (downloadable.length > 0) {
      return { downloadable, synopsis, screenshots, enrichedGame }
    }
  }
  return { downloadable: [], synopsis, screenshots, enrichedGame }
}
