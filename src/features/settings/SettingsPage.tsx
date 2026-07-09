import { APP_LOCALE } from '../../shared/config/locale'
import type { Source } from '../../shared/types/contracts'

type SettingsPageProps = {
  defaultDownloadPath: string
  diskFreeBytes: number | null
  installOrganization: string
  afterInstallAction: string
  sources: Source[]
  sourcesLoading: boolean
  removeTemporaryFiles: boolean
  seedTorrentsEnabled: boolean
  downloadSpeedLimit: string
  addingSource: boolean
  sourceUrlInput: string
  setSourceUrlInput: (value: string) => void
  onAddSourceByUrl: () => Promise<void>
  isSourceEnabled: (sourceId: string) => boolean
  setDefaultDownloadPath: (value: string) => void
  setInstallOrganization: (value: string) => void
  setAfterInstallAction: (value: string) => void
  handleSelectDefaultPath: () => Promise<void>
  handleSaveInstallSettings: () => Promise<void>
  onImportSource: () => Promise<void>
  onOpenCatalogsFolder: () => Promise<void>
  onDeleteSource: (sourceId: string, sourceName: string) => Promise<void>
  onSyncSource: (sourceId: string, sourceName: string) => Promise<void>
  onSyncAllSources: () => Promise<void>
  deletingSourceId: string | null
  syncingSourceId: string | null
  syncingAllSources: boolean
  handleToggleSource: (sourceId: string) => void
  handleToggleRemoveTemp: (next: boolean) => Promise<void>
  handleToggleSeed: (enabled: boolean) => Promise<void>
  handleSpeedLimitChange: (value: string) => Promise<void>
  formatSize: (bytes?: number) => string
}

function formatGameCount(count: number): string {
  return count.toLocaleString(APP_LOCALE)
}

export function SettingsPage({
  defaultDownloadPath,
  diskFreeBytes,
  installOrganization,
  afterInstallAction,
  sources,
  sourcesLoading,
  removeTemporaryFiles,
  seedTorrentsEnabled,
  downloadSpeedLimit,
  addingSource,
  sourceUrlInput,
  setSourceUrlInput,
  onAddSourceByUrl,
  isSourceEnabled,
  handleSelectDefaultPath,
  handleSaveInstallSettings,
  onImportSource,
  onOpenCatalogsFolder,
  onDeleteSource,
  onSyncSource,
  onSyncAllSources,
  deletingSourceId,
  syncingSourceId,
  syncingAllSources,
  handleToggleSource,
  handleToggleRemoveTemp,
  handleToggleSeed,
  handleSpeedLimitChange,
  formatSize,
  setDefaultDownloadPath,
  setInstallOrganization,
  setAfterInstallAction,
}: SettingsPageProps) {
  const isManagingSources =
    deletingSourceId !== null || syncingSourceId !== null || syncingAllSources

  return (
    <section className="settings-page">
      <div className="settings-stack">
        <div className="settings-stack__row">
          <section id="settings-folder" className="settings-block">
            <header className="settings-block__head">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">Instalação</h2>
                <p className="settings-block__desc">Defina onde os jogos serão salvos.</p>
              </div>
              <span className="settings-block__meta">
                {diskFreeBytes != null ? `${formatSize(diskFreeBytes)} livres` : '—'}
              </span>
            </header>

            <div className="settings-block__body">
              <label className="settings-field settings-field--stack">
                <span>Pasta de destino</span>
                <div className="settings-inline">
                  <input
                    className="settings-input"
                    placeholder="C:\\Games"
                    value={defaultDownloadPath}
                    onChange={(event) => setDefaultDownloadPath(event.target.value)}
                  />
                  <button
                    className="btn btn-outline btn--compact"
                    type="button"
                    onClick={() => void handleSelectDefaultPath()}
                  >
                    Procurar
                  </button>
                </div>
              </label>

              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Organização das pastas</span>
                  <select
                    className="settings-input"
                    value={installOrganization}
                    onChange={(event) => setInstallOrganization(event.target.value)}
                  >
                    <option value="separate-folder">Uma pasta por jogo</option>
                    <option value="single-folder">Todos na mesma pasta</option>
                  </select>
                </label>

                <label className="settings-field">
                  <span>Após concluir instalação</span>
                  <select
                    className="settings-input"
                    value={afterInstallAction}
                    onChange={(event) => setAfterInstallAction(event.target.value)}
                  >
                    <option value="ask">Perguntar sempre</option>
                    <option value="open-folder">Abrir pasta</option>
                    <option value="launch-game">Iniciar jogo</option>
                  </select>
                </label>
              </div>
            </div>

            <footer className="settings-block__footer">
              <span className="settings-block__footer-spacer" aria-hidden="true" />
              <button
                className="btn btn-primary btn--compact"
                type="button"
                onClick={() => void handleSaveInstallSettings()}
              >
                Salvar
              </button>
            </footer>
          </section>

          <section id="settings-downloads" className="settings-block">
            <header className="settings-block__head">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">Downloads</h2>
                <p className="settings-block__desc">Velocidade e comportamento dos torrents.</p>
              </div>
            </header>

            <div className="settings-block__body settings-block__body--tight">
              <label className="settings-toggle settings-toggle--select">
                <span>Limite de velocidade</span>
                <select
                  className="settings-input settings-input--narrow"
                  value={downloadSpeedLimit}
                  onChange={(event) => void handleSpeedLimitChange(event.target.value)}
                >
                  <option value="ilimitado">Ilimitado</option>
                  <option value="50mb">50 MB/s</option>
                  <option value="20mb">20 MB/s</option>
                  <option value="10mb">10 MB/s</option>
                </select>
              </label>

              <div className="settings-toggle">
                <div className="settings-toggle__copy">
                  <span>Apagar arquivos temporários</span>
                  <span className="settings-toggle__hint">Libera espaço após a instalação</span>
                </div>
                <button
                  type="button"
                  className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label="Apagar arquivos temporários"
                  onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
                />
              </div>

              <div className="settings-toggle">
                <div className="settings-toggle__copy">
                  <span>Fazer seed após concluir</span>
                  <span className="settings-toggle__hint">Continua compartilhando o torrent</span>
                </div>
                <button
                  type="button"
                  className={seedTorrentsEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label="Fazer seed do torrent"
                  onClick={() => void handleToggleSeed(!seedTorrentsEnabled)}
                />
              </div>
            </div>
          </section>
        </div>

        <section id="settings-catalog" className="settings-block settings-block--wide">
          <header className="settings-block__head">
            <div className="settings-block__head-copy">
              <h2 className="settings-block__title">Catálogo</h2>
              <p className="settings-block__desc">
                Cole a URL oficial do hydralinks ou importe um arquivo .json local. Importações são
                copiadas para a pasta interna — pode apagar o arquivo original depois.
              </p>
            </div>
            <div className="settings-block__head-actions">
              <button
                type="button"
                className="btn btn-outline btn--compact"
                disabled={addingSource}
                onClick={() => void onOpenCatalogsFolder()}
              >
                Abrir pasta
              </button>
              <button
                type="button"
                className="btn btn-primary btn--compact"
                disabled={addingSource}
                onClick={() => void onImportSource()}
              >
                {addingSource ? 'Importando…' : 'Importar'}
              </button>
              {sources.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline btn--compact"
                  disabled={isManagingSources || sourcesLoading}
                  onClick={() => void onSyncAllSources()}
                >
                  {syncingAllSources ? 'Atualizando…' : 'Atualizar todas'}
                </button>
              ) : null}
            </div>
          </header>

          <div className="settings-block__body">
            <label className="settings-field settings-field--stack">
              <span>URL do catálogo</span>
              <div className="settings-inline">
                <input
                  className="settings-input"
                  type="url"
                  placeholder="https://hydralinks.cloud/sources/fitgirl.json"
                  value={sourceUrlInput}
                  disabled={addingSource}
                  onChange={(event) => setSourceUrlInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void onAddSourceByUrl()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn--compact"
                  disabled={addingSource || !sourceUrlInput.trim()}
                  onClick={() => void onAddSourceByUrl()}
                >
                  {addingSource ? 'Adicionando…' : 'Adicionar'}
                </button>
              </div>
            </label>

            {sources.length === 0 && !sourcesLoading ? (
              <p className="settings-block__hint">
                Nenhuma fonte ainda. Cole uma URL acima ou clique em Importar para escolher um .json
                local.
              </p>
            ) : (
              <div className="settings-source-table-wrap">
                <ul className="settings-source-table settings-source-table--simple" role="list">
                  {sources.map((source) => {
                    const enabled = isSourceEnabled(source.id)
                    const gameCount =
                      source.downloadCount > 0 ? formatGameCount(source.downloadCount) : '—'
                    return (
                      <li
                        key={source.id}
                        className={`settings-source-row${enabled ? '' : ' settings-source-row--off'}`}
                      >
                        <div className="settings-source-table__col settings-source-table__col--name">
                          <strong className="settings-source-row__name">{source.name}</strong>
                          <span className="settings-source-row__count-inline">
                            {gameCount} jogos
                          </span>
                        </div>
                        <div className="settings-source-table__col settings-source-table__col--on">
                          <button
                            type="button"
                            className={enabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                            disabled={isManagingSources}
                            aria-pressed={enabled}
                            aria-label={
                              enabled ? `Desativar ${source.name}` : `Ativar ${source.name}`
                            }
                            onClick={() => handleToggleSource(source.id)}
                          />
                        </div>
                        <div className="settings-source-table__col settings-source-table__col--actions">
                          <div
                            className="settings-source-actions"
                            role="group"
                            aria-label={`Ações de ${source.name}`}
                          >
                            <button
                              type="button"
                              className="btn btn-outline btn--compact settings-source-actions__btn"
                              disabled={isManagingSources}
                              onClick={() => void onSyncSource(source.id, source.name)}
                            >
                              {syncingSourceId === source.id ? '…' : 'Atualizar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn--compact settings-source-actions__btn"
                              disabled={isManagingSources}
                              aria-label={`Excluir ${source.name}`}
                              onClick={() => void onDeleteSource(source.id, source.name)}
                            >
                              {deletingSourceId === source.id ? '…' : 'Excluir'}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>

      </div>
    </section>
  )
}
