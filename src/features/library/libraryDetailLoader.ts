import type { TFunction } from 'i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { isAppLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import { formatUserError } from '../../shared/utils/formatUserError'
import type { LibraryDetailState } from './libraryControllerTypes'
import type { LibraryEntry } from './types'

export function loadingLibraryDetail(item: LibraryEntry): LibraryDetailState {
  return {
    item, game: null, loading: true, error: null, options: [],
    synopsis: null, screenshots: [], note: '', noteSaving: false, busyUrl: null,
  }
}

export async function loadLibraryDetail(
  item: LibraryEntry,
  t: TFunction,
): Promise<LibraryDetailState> {
  const language = isAppLanguage(i18n.language) ? i18n.language : undefined
  try {
    const [detail, note] = await Promise.all([
      sourcesApi.getGameDetail({
        title: item.title, includeSteam: true, language,
      }),
      sourcesApi.getLibraryNote(item.destPath, item.title).catch(() => ''),
    ])
    if (!detail?.game) {
      return {
        ...loadingLibraryDetail(item),
        loading: false, error: t('gameDetail.notFound'), note,
      }
    }
    return {
      item, game: detail.game, loading: false, error: null,
      options: detail.downloads ?? [], synopsis: detail.synopsis ?? null,
      screenshots: detail.screenshots ?? [], note,
      noteSaving: false, busyUrl: null,
    }
  } catch (error) {
    const note = await sourcesApi
      .getLibraryNote(item.destPath, item.title)
      .catch(() => '')
    return {
      item,
      game: { id: item.id, title: item.title, genre: '', source: 'library' },
      loading: false,
      error: formatUserError(error, t('discover.detailError')),
      options: [], synopsis: null, screenshots: [], note,
      noteSaving: false, busyUrl: null,
    }
  }
}
