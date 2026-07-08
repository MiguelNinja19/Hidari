import type { Source } from '../../shared/types/contracts'

type DiscoverNoSourcesProps = {
  sources: Source[]
  onGoSettings: () => void
}

export function DiscoverNoSources({ sources, onGoSettings }: DiscoverNoSourcesProps) {
  const hasSources = sources.length > 0

  return (
    <div className="discover-setup-wrap">
      <div className="discover-setup">
        <h2 className="discover-setup__title">
          {hasSources ? 'Nenhuma fonte ativa' : 'Sem catálogo importado'}
        </h2>
        {hasSources ? (
          <p className="discover-setup__text">
            Ative pelo menos uma fonte em Configurações para pesquisar jogos aqui.
          </p>
        ) : null}
        <button
          className="btn btn-primary discover-setup__action"
          type="button"
          onClick={onGoSettings}
        >
          Abrir Configurações
        </button>
      </div>
    </div>
  )
}
