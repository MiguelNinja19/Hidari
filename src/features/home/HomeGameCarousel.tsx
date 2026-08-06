/**
 * Carrossel horizontal de jogos. Reutilizado para as sees Hot/Weekly/Challenge.
 */

import type { ReactNode } from 'react'
import type { HomeGame } from '../../shared/types/contracts/home'
import { HomeGameCard } from './HomeGameCard'

type HomeGameCarouselProps = {
  title: string
  games: HomeGame[]
  isLoading?: boolean
  error?: string | null
  emptyMessage?: string
  onGameClick?: (game: HomeGame) => void
  /** Optional badge/icon to render after the title (e.g., "" for hot) */
  titleBadge?: ReactNode
}

export function HomeGameCarousel({
  title,
  games,
  isLoading = false,
  error = null,
  emptyMessage = 'Nenhum jogo disponvel',
  onGameClick,
  titleBadge,
}: HomeGameCarouselProps) {
  return (
    <section className="home-carousel">
      <header className="home-carousel__header">
        <h2 className="home-carousel__title">
          {title}
          {titleBadge ? <span className="home-carousel__badge">{titleBadge}</span> : null}
        </h2>
        {isLoading ? <span className="home-carousel__loading">Carregando...</span> : null}
      </header>

      {error ? (
        <div className="home-carousel__error">Erro: {error}</div>
      ) : isLoading && games.length === 0 ? (
        <div className="home-carousel__skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="home-carousel__skeleton-card" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="home-carousel__empty">{emptyMessage}</div>
      ) : (
        <div className="home-carousel__grid">
          {games.map((g) => (
            <HomeGameCard
              key={`${g.shop}:${g.object_id}`}
              game={g}
              onClick={() => onGameClick?.(g)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
