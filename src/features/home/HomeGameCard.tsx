/**
 * Card individual de jogo na Home screen.
 * Mostra a cover image + ttulo.
 */

import type { HomeGame } from '../../shared/types/contracts/home'

type HomeGameCardProps = {
  game: Pick<HomeGame, 'title' | 'cover_image_url' | 'object_id' | 'shop'>
  onClick?: () => void
}

export function HomeGameCard({ game, onClick }: HomeGameCardProps) {
  const coverUrl = game.cover_image_url ?? null

  return (
    <button
      type="button"
      onClick={onClick}
      className="home-game-card"
      title={game.title}
      aria-label={`Ver detalhes de ${game.title}`}
    >
      <div className="home-game-card__cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={game.title}
            loading="lazy"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="home-game-card__placeholder">
            <span>{game.title.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="home-game-card__title">{game.title}</div>
    </button>
  )
}
