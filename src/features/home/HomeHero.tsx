/**
 * Hero banner da Home screen. Mostra o jogo em destaque com:
 * - Imagem de fundo (library_hero_image_url)
 * - Logo do jogo (logo_image_url)
 * - Descrio curta
 * - Botes: "Ver Detalhes" e "Adicionar  Biblioteca"
 */

import type { FeaturedGame } from '../../shared/types/contracts/home'

type HomeHeroProps = {
  game: FeaturedGame | null
  isLoading: boolean
  error?: string | null
  onViewDetails?: (game: FeaturedGame) => void
  onAddToLibrary?: (game: FeaturedGame) => void
}

export function HomeHero({ game, isLoading, error, onViewDetails, onAddToLibrary }: HomeHeroProps) {
  if (isLoading && !game) {
    return (
      <section className="home-hero home-hero--loading">
        <div className="home-hero__skeleton" />
      </section>
    )
  }

  if (error || !game) {
    return (
      <section className="home-hero home-hero--empty">
        <div className="home-hero__empty-content">
          <h1 className="home-hero__title">Bem-vindo ao Hidari</h1>
          <p className="home-hero__subtitle">
            {error
              ? 'No foi possvel carregar o jogo em destaque. Verifique sua conexo.'
              : 'Explore jogos, baixe repacks e gerencie sua biblioteca.'}
          </p>
        </div>
      </section>
    )
  }

  const heroImageUrl = game.library_hero_image_url ?? game.library_image_url ?? null
  const logoUrl = game.logo_image_url ?? null

  return (
    <section
      className="home-hero"
      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
    >
      <div className="home-hero__overlay" />
      <div className="home-hero__content">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={game.title}
            className="home-hero__logo"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <h1 className="home-hero__title">{game.title}</h1>
        )}

        {game.description ? (
          <p className="home-hero__description">{game.description}</p>
        ) : null}

        <div className="home-hero__actions">
          <button
            type="button"
            className="home-hero__btn home-hero__btn--primary"
            onClick={() => onViewDetails?.(game)}
          >
            Ver Detalhes
          </button>
          <button
            type="button"
            className="home-hero__btn home-hero__btn--secondary"
            onClick={() => onAddToLibrary?.(game)}
          >
            Adicionar  Biblioteca
          </button>
        </div>
      </div>
    </section>
  )
}
