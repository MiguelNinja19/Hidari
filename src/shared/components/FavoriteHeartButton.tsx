import { useTranslation } from 'react-i18next'

type FavoriteHeartButtonProps = {
  active: boolean
  busy?: boolean
  size?: 'toolbar' | 'card'
  className?: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function FavoriteHeartButton({
  active,
  busy = false,
  size = 'toolbar',
  className = '',
  onClick,
}: FavoriteHeartButtonProps) {
  const { t } = useTranslation()
  const label = active ? t('discover.removeFavorite') : t('discover.addFavorite')

  return (
    <button
      type="button"
      className={`favorite-heart favorite-heart--${size}${active ? ' favorite-heart--on' : ''}${busy ? ' is-busy' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? (
        <span className="favorite-heart__spinner" aria-hidden="true" />
      ) : (
        <svg className="favorite-heart__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )}
    </button>
  )
}
