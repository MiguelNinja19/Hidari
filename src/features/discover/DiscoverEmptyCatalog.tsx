type DiscoverEmptyCatalogProps = {
  onGoSettings: () => void
}

export function DiscoverEmptyCatalog({ onGoSettings }: DiscoverEmptyCatalogProps) {
  return (
    <div className="discover-setup-wrap">
      <div className="discover-setup discover-setup--warn">
        <h2 className="discover-setup__title">Catálogo vazio</h2>
        <p className="discover-setup__text">
          A fonte está registrada, mas não tem jogos importados. Em Configurações, use "Buscar" para
          selecionar o arquivo .json e clique em "Importar".
        </p>
        <button className="btn btn-primary discover-setup__action" type="button" onClick={onGoSettings}>
          Importar catálogo
        </button>
      </div>
    </div>
  )
}
