/**
 * HomePage - layout principal da Home screen.
 * Compõe: Hero banner + 3 seções (Hot, Weekly, Challenge).
 */

import { useHomeData } from './useHomeData'
import { HomeHero } from './HomeHero'
import { HomeGameCarousel } from './HomeGameCarousel'
import type { HomeGame, FeaturedGame } from '../../shared/types/contracts/home'

type HomePageProps = {
  onNavigateToGame?: (shop: string, objectId: string, title: string) => void
  onAddToLibrary?: (game: HomeGame) => void
}

export function HomePage({ onNavigateToGame, onAddToLibrary }: HomePageProps) {
  const { featured, hot, weekly, challenge, refresh, isLoading } = useHomeData()

  const handleGameClick = (game: HomeGame) => {
    onNavigateToGame?.(game.shop, game.object_id, game.title)
  }

  const handleHeroViewDetails = (game: FeaturedGame) => {
    onNavigateToGame?.(game.shop, game.object_id, game.title)
  }

  const handleHeroAdd = (game: FeaturedGame) => {
    onAddToLibrary?.(game)
  }

  return (
    <div className="home-page">
      <header className="home-page__top-bar">
        <h1 className="home-page__brand">Início</h1>
        <button
          type="button"
          className="home-page__refresh"
          onClick={() => void refresh()}
          disabled={isLoading}
          title="Atualizar"
        >
          ↻ Atualizar
        </button>
      </header>

      <HomeHero
        game={featured.data}
        isLoading={featured.status === 'loading'}
        error={featured.error}
        onViewDetails={handleHeroViewDetails}
        onAddToLibrary={handleHeroAdd}
      />

      <div className="home-page__sections">
        <HomeGameCarousel
          title="Em Alta Agora"
          titleBadge="🔥"
          games={hot.data ?? []}
          isLoading={hot.status === 'loading'}
          error={hot.error}
          onGameClick={handleGameClick}
        />

        <HomeGameCarousel
          title="Populares da Semana"
          titleBadge="📈"
          games={weekly.data ?? []}
          isLoading={weekly.status === 'loading'}
          error={weekly.error}
          onGameClick={handleGameClick}
        />

        <HomeGameCarousel
          title="Desafie-se: Achievements Difíceis"
          titleBadge="🏆"
          games={challenge.data ?? []}
          isLoading={challenge.status === 'loading'}
          error={challenge.error}
          onGameClick={handleGameClick}
          emptyMessage="Nenhum challenge disponível"
        />
      </div>
    </div>
  )
}
