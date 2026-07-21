import { useTranslation } from 'react-i18next'
import { FavoriteHeartButton } from '../../shared/components/FavoriteHeartButton'

type DiscoverDetailToolbarProps = {
  favorite: boolean
  favoriteBusy: boolean
  onBack: () => void
  onToggleFavorite: () => void
}

export function DiscoverDetailToolbar({
  favorite,
  favoriteBusy,
  onBack,
  onToggleFavorite,
}: DiscoverDetailToolbarProps) {
  const { t } = useTranslation()
  return (
    <header className="discover-detail__toolbar">
      <button type="button" className="discover-detail__back" onClick={onBack}>
        <span className="discover-detail__back-arrow" aria-hidden="true">←</span>
        {t('common.back')}
      </button>
      <FavoriteHeartButton active={favorite} busy={favoriteBusy} size="toolbar" onClick={() => onToggleFavorite()} />
    </header>
  )
}
