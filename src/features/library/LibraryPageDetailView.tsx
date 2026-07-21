import { useTranslation } from 'react-i18next'
import { DiscoverGameDetailPage } from '../discover/DiscoverGameDetailPage'
import type { CatalogGame } from '../../shared/types/contracts'
import type { LibraryControllerValue } from './LibraryController'

type LibraryPageDetailViewProps = {
  detail: NonNullable<LibraryControllerValue['libraryDetail']>
  isFavorite: (game: CatalogGame) => boolean
  isBusy: (game: CatalogGame) => boolean
  toggleFavorite: (game: CatalogGame) => Promise<boolean | null>
  onBack: () => void
  setLibraryDetailNote: (note: string) => void
  saveLibraryDetailNote: () => Promise<void>
}

export function LibraryPageDetailView({
  detail,
  isFavorite,
  isBusy,
  toggleFavorite,
  onBack,
  setLibraryDetailNote,
  saveLibraryDetailNote,
}: LibraryPageDetailViewProps) {
  const { t } = useTranslation()
  const fallbackGame = {
    id: detail.item.id,
    title: detail.item.title,
    genre: '',
    source: 'library',
    groupKey: detail.game?.groupKey ?? null,
  }
  const game = detail.game ?? fallbackGame
  const detailFavorite = isFavorite(game)
  const detailFavoriteBusy = isBusy(game)

  return (
    <DiscoverGameDetailPage
      game={game}
      loading={detail.loading}
      error={detail.error}
      options={[]}
      synopsis={detail.synopsis}
      screenshots={detail.screenshots}
      busyUrl={null}
      favorite={detailFavorite}
      favoriteBusy={detailFavoriteBusy}
      hideDownloads
      onToggleFavorite={() => {
        if (detailFavoriteBusy) return
        void toggleFavorite(game)
      }}
      onBack={onBack}
      footerSlot={
        <label className="library-detail-note">
          <span className="library-detail-note__label">{t('library.noteLabel')}</span>
          <textarea
            className="library-detail-note__input"
            rows={3}
            value={detail.note}
            placeholder={t('library.notePlaceholder')}
            onChange={(event) => setLibraryDetailNote(event.target.value)}
            onBlur={() => void saveLibraryDetailNote()}
          />
          {detail.noteSaving ? (
            <span className="library-detail-note__hint">{t('common.saving')}</span>
          ) : null}
        </label>
      }
    />
  )
}
