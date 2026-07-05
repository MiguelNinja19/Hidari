import { Loader } from '../../shared/components/Loader'
import type { Source } from '../../shared/types/contracts'

type DiscoverNoSourcesProps = {
  sources: Source[]
  sourcesLoading: boolean
  isSourceEnabled: (sourceId: string) => boolean
  onGoSettings: () => void
}

function formatSourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url
  }
}

export function DiscoverNoSources({
  sources,
  sourcesLoading,
  isSourceEnabled,
  onGoSettings,
}: DiscoverNoSourcesProps) {
  const hasSources = sources.length > 0
  const disabledSources = hasSources ? sources.filter((source) => !isSourceEnabled(source.id)) : []

  return (
    <div className="discover-setup">
      <div className="discover-setup__copy">
        <p className="discover-setup__tag">Fontes</p>
        <h2 className="discover-setup__title">
          {hasSources ? 'Nenhuma fonte ativa' : 'Sem fontes configuradas'}
        </h2>
        <p className="discover-setup__desc">
          {hasSources
            ? 'As fontes abaixo estão desativadas. Ative pelo menos uma em Configurações para pesquisar jogos.'
            : 'Adicione uma fonte (.json) em Configurações para começar a explorar o catálogo.'}
        </p>
      </div>

      {sourcesLoading ? (
        <div className="discover-setup__loading">
          <Loader size="sm" label="A carregar fontes" />
          <span>A carregar fontes…</span>
        </div>
      ) : hasSources ? (
        <ul className="discover-setup__list">
          {disabledSources.map((source) => (
            <li key={source.id} className="discover-setup__item discover-setup__item--off">
              <span className="discover-setup__item-name">{source.name}</span>
              <span className="discover-setup__item-host">{formatSourceHost(source.url)}</span>
              <span className="discover-setup__item-status">Off</span>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="discover-setup__steps">
          <li>Abra Configurações</li>
          <li>Cole a URL de uma fonte (.json)</li>
          <li>Active a fonte e volte a Explorar</li>
        </ol>
      )}

      <button className="btn btn-primary discover-setup__action" type="button" onClick={onGoSettings}>
        {hasSources ? 'Ativar em Configurações' : 'Abrir Configurações'}
      </button>
    </div>
  )
}
