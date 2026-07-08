import { useMemo } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_LOCALE } from '../../shared/config/locale'
import { InlineAlert } from '../../shared/components/InlineAlert'
import type { Source, SteamAppIndexStatus } from '../../shared/types/contracts'

type SettingsPageProps = {
  sourceUrl: string
  defaultDownloadPath: string
  savePathError: string
  diskFreeBytes: number | null
  installOrganization: string
  afterInstallAction: string
  sources: Source[]
  sourcesLoading: boolean
  sourcesError: string | null
  sourcesNotice: string | null
  removeTemporaryFiles: boolean
  seedTorrentsEnabled: boolean
  downloadSpeedLimit: string
  canSubmitSource: boolean
  addingSource: boolean
  isSourceEnabled: (sourceId: string) => boolean
  setSourceUrl: (value: string) => void
  setDefaultDownloadPath: (value: string) => void
  setInstallOrganization: (value: string) => void
  setAfterInstallAction: (value: string) => void
  handleSelectDefaultPath: () => Promise<void>
  handleSaveInstallSettings: () => Promise<void>
  handleAddSource: (event: FormEvent<HTMLFormElement>) => void
  onSelectSourceFile: () => Promise<void>
  onDeleteSource: (sourceId: string, sourceName: string) => Promise<void>
  onSyncSource: (sourceId: string) => Promise<void>
  onSyncAllSources: () => Promise<void>
  deletingSourceId: string | null
  syncingSourceId: string | null
  syncingAllSources: boolean
  handleToggleSource: (sourceId: string) => void
  handleToggleRemoveTemp: (next: boolean) => Promise<void>
  handleToggleSeed: (enabled: boolean) => Promise<void>
  handleSpeedLimitChange: (value: string) => Promise<void>
  formatSize: (bytes?: number) => string
  coverCatalogTotal: number
  coverCachedTotal: number
  coverProgressPct: number
  coverPrecacheRunning: boolean
  coverPrecacheProcessed: number
  coverPrecacheTotal: number
  coverUnresolvedTotal: number
  onStartCoverPrecache: () => Promise<void>
  onStopCoverPrecache: () => Promise<void>
  onRetryUnresolvedCovers: () => Promise<void>
  steamAppIndexStatus: SteamAppIndexStatus | null
  steamAppIndexRefreshing: boolean
  onRefreshSteamAppIndex: () => Promise<void>
  appVersion: string | null
}

function formatGameCount(count: number): string {
  return count.toLocaleString(APP_LOCALE)
}

function fileLabelFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

function formatSteamIndexUpdatedAt(unixSecs: number | null): string {
  if (!unixSecs) return 'nunca'
  const diffMs = Date.now() - unixSecs * 1000
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes} min`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `há ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays}d`
}

export function SettingsPage({
  sourceUrl,
  defaultDownloadPath,
  savePathError,
  diskFreeBytes,
  installOrganization,
  afterInstallAction,
  sources,
  sourcesLoading,
  sourcesError,
  sourcesNotice,
  removeTemporaryFiles,
  seedTorrentsEnabled,
  downloadSpeedLimit,
  canSubmitSource,
  addingSource,
  isSourceEnabled,
  handleSelectDefaultPath,
  handleSaveInstallSettings,
  handleAddSource,
  onSelectSourceFile,
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
  coverCatalogTotal,
  coverCachedTotal,
  coverProgressPct,
  coverPrecacheRunning,
  coverPrecacheProcessed,
  coverPrecacheTotal,
  coverUnresolvedTotal,
  onStartCoverPrecache,
  onStopCoverPrecache,
  onRetryUnresolvedCovers,
  steamAppIndexStatus,
  steamAppIndexRefreshing,
  onRefreshSteamAppIndex,
  appVersion,
  setDefaultDownloadPath,
  setInstallOrganization,
  setAfterInstallAction,
}: SettingsPageProps) {
  const { t } = useTranslation()
  const isManagingSources =
    deletingSourceId !== null || syncingSourceId !== null || syncingAllSources

  const { activeCount, totalGames } = useMemo(() => {
    let games = 0
    let active = 0
    for (const source of sources) {
      if (isSourceEnabled(source.id)) {
        active += 1
        games += source.downloadCount
      }
    }
    return { activeCount: active, totalGames: games }
  }, [sources, isSourceEnabled])

  const selectedFileName = sourceUrl.trim() ? fileLabelFromPath(sourceUrl) : null

  return (
    <section className="settings-page">
      <header className="settings-page__header page-header">
        <div className="settings-page__header-row">
          <div className="settings-page__header-copy">
            <h1 className="page-header__title settings-page__title">{t('settings.title')}</h1>
            <p className="page-header__desc settings-page__desc">{t('settings.subtitle')}</p>
          </div>
          <p className="settings-page__version">
            {appVersion ? t('settings.version', { version: appVersion }) : t('settings.version', { version: '—' })}
          </p>
        </div>
      </header>

      <div className="settings-stack">
        <section
          id="settings-catalog"
          className="settings-block settings-block--wide settings-block--highlight"
        >
          <header className="settings-block__head settings-block__head--stack">
            <div className="settings-block__head-row">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">Catálogo</h2>
                <p className="settings-block__desc">
                  Importe um .json local para pesquisar jogos em Explorar.
                </p>
              </div>
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
            {sources.length > 0 || sourcesLoading ? (
              <div className="settings-summary" aria-label="Resumo do catálogo">
                <span className="settings-summary__item">
                  <strong>{sources.length}</strong>
                  {sources.length === 1 ? ' fonte' : ' fontes'}
                </span>
                <span className="settings-summary__sep" aria-hidden="true">
                  ·
                </span>
                <span className="settings-summary__item">
                  <strong>{formatGameCount(totalGames)}</strong> jogos
                </span>
                <span className="settings-summary__sep" aria-hidden="true">
                  ·
                </span>
                <span className="settings-summary__item">
                  <strong>{activeCount}</strong> ativas
                </span>
                {sourcesLoading ? (
                  <span className="settings-summary__loading">Carregando…</span>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className="settings-block__body">
            <div className="settings-import-panel settings-import-panel--primary">
              {sourcesError ? (
                <InlineAlert className="settings-block__alert" variant="error">
                  {sourcesError}
                </InlineAlert>
              ) : null}
              {sourcesNotice ? (
                <InlineAlert className="settings-block__alert" variant="info">
                  {sourcesNotice}
                </InlineAlert>
              ) : null}

              <form onSubmit={handleAddSource} className="settings-import-form settings-import-form--inline">
                <button
                  className={`settings-file-slot settings-import-form__pick${
                    selectedFileName ? ' settings-file-slot--filled' : ''
                  }`}
                  type="button"
                  disabled={addingSource}
                  onClick={() => void onSelectSourceFile()}
                >
                  <span className="settings-file-slot__label">Arquivo .json</span>
                  <span
                    className={
                      selectedFileName
                        ? 'settings-file-slot__name'
                        : 'settings-file-slot__placeholder'
                    }
                  >
                    {selectedFileName ?? 'Escolher arquivo do catálogo'}
                  </span>
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={!canSubmitSource || addingSource}
                >
                  {addingSource ? 'Importando…' : 'Importar'}
                </button>
              </form>
            </div>

            {sources.length === 0 && !sourcesLoading ? (
              <div className="settings-empty">
                <p className="settings-empty__title">Sem catálogo</p>
                <p className="settings-empty__text">
                  Escolha um arquivo .json acima para pesquisar jogos em Explorar.
                </p>
              </div>
            ) : (
              <div className="settings-source-table-wrap">
                <ul className="settings-source-table" role="list">
                  <li className="settings-source-table__head" aria-hidden="true">
                    <span className="settings-source-table__col settings-source-table__col--name">
                      Fonte
                    </span>
                    <span className="settings-source-table__col settings-source-table__col--count">
                      Jogos
                    </span>
                    <span className="settings-source-table__col settings-source-table__col--on">
                      Ativa
                    </span>
                    <span className="settings-source-table__col settings-source-table__col--actions">
                      Ações
                    </span>
                  </li>
                  {sources.map((source) => {
                    const enabled = isSourceEnabled(source.id)
                    const fileName = fileLabelFromPath(source.url)
                    const gameCount =
                      source.downloadCount > 0 ? formatGameCount(source.downloadCount) : '—'
                    return (
                      <li
                        key={source.id}
                        className={`settings-source-row${enabled ? '' : ' settings-source-row--off'}`}
                      >
                        <div className="settings-source-table__col settings-source-table__col--name">
                          <div className="settings-source-row__main">
                            <strong className="settings-source-row__name">{source.name}</strong>
                            <span className="settings-source-row__file" title={source.url}>
                              {fileName}
                            </span>
                          </div>
                          <span
                            className={`settings-source-row__badge${
                              enabled ? ' settings-source-row__badge--on' : ''
                            }`}
                          >
                            {enabled ? 'Ativa' : 'Inativa'}
                          </span>
                        </div>
                        <div
                          className="settings-source-table__col settings-source-table__col--count"
                          data-label="Jogos"
                        >
                          <span className="settings-source-row__count">{gameCount}</span>
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
                          <div className="settings-source-actions" role="group" aria-label={`Ações de ${source.name}`}>
                            <button
                              type="button"
                              className="btn btn-outline btn--compact settings-source-actions__btn"
                              disabled={isManagingSources}
                              onClick={() => void onSyncSource(source.id)}
                            >
                              {syncingSourceId === source.id ? '…' : 'Atual.'}
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

        <div className="settings-stack__row">
          <section id="settings-folder" className="settings-block">
          <header className="settings-block__head">
            <div className="settings-block__head-copy">
              <h2 className="settings-block__title">Pasta de instalação</h2>
              <p className="settings-block__desc">Onde os jogos são guardados.</p>
            </div>
            <span className="settings-block__meta">
              {diskFreeBytes != null ? `${formatSize(diskFreeBytes)} livres` : '—'}
            </span>
          </header>

          <div className="settings-block__body">
            <label className="settings-field settings-field--stack">
              <span>Caminho</span>
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
                <span>Organização</span>
                <select
                  className="settings-input"
                  value={installOrganization}
                  onChange={(event) => setInstallOrganization(event.target.value)}
                >
                  <option value="separate-folder">Pasta por jogo</option>
                  <option value="single-folder">Mesma pasta</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Depois de instalar</span>
                <select
                  className="settings-input"
                  value={afterInstallAction}
                  onChange={(event) => setAfterInstallAction(event.target.value)}
                >
                  <option value="ask">Perguntar</option>
                  <option value="open-folder">Abrir pasta</option>
                  <option value="launch-game">Iniciar jogo</option>
                </select>
              </label>
            </div>
          </div>

          <footer className="settings-block__footer">
            {savePathError ? (
              <InlineAlert className="settings-block__alert" variant="error">
                {savePathError}
              </InlineAlert>
            ) : (
              <span className="settings-block__footer-spacer" aria-hidden="true" />
            )}
            <button
              className="btn btn-primary btn--compact"
              type="button"
              onClick={() => void handleSaveInstallSettings()}
            >
              Guardar pasta
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
                <span>Apagar ficheiros temporários</span>
                <span className="settings-toggle__hint">Liberta espaço após a instalação</span>
              </div>
              <button
                type="button"
                className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
                aria-label="Apagar ficheiros temporários"
                onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
              />
            </div>

            <div className="settings-toggle">
              <div className="settings-toggle__copy">
                <span>Seed após concluir</span>
                <span className="settings-toggle__hint">Continua a partilhar o torrent</span>
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

        <section id="settings-covers" className="settings-block settings-block--wide">
          <header className="settings-block__head settings-block__head--stack">
            <div className="settings-block__head-row">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">Capas</h2>
                <p className="settings-block__desc">
                  Carregam sob demanda ao navegar. Use Pré-baixar para guardar em disco.
                </p>
              </div>
              <div className="settings-block__head-actions">
                {coverCatalogTotal > 0 && coverUnresolvedTotal > 0 && !coverPrecacheRunning ? (
                  <button
                    type="button"
                    className="btn btn-outline btn--compact"
                    onClick={() => void onRetryUnresolvedCovers()}
                  >
                    Tentar ({formatGameCount(coverUnresolvedTotal)})
                  </button>
                ) : null}
                {coverCatalogTotal > 0 ? (
                  coverPrecacheRunning ? (
                    <button
                      type="button"
                      className="btn btn-outline btn--compact"
                      onClick={() => void onStopCoverPrecache()}
                    >
                      Parar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn--compact"
                      onClick={() => void onStartCoverPrecache()}
                    >
                      Pré-baixar
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </header>

          <div className="settings-block__body">
            {coverCatalogTotal > 0 ? (
              <>
                <div
                  className="settings-cover-progress"
                  role="progressbar"
                  aria-valuenow={coverProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso das capas em cache"
                >
                  <div
                    className="settings-cover-progress__bar"
                    style={{ width: `${coverProgressPct}%` }}
                  />
                </div>
                <p className="settings-cover-progress__label">
                  {coverPrecacheRunning ? (
                    <>
                      <strong>{formatGameCount(coverPrecacheProcessed)}</strong> /{' '}
                      <strong>{formatGameCount(coverPrecacheTotal)}</strong>
                      {' · '}
                      {coverProgressPct}%
                    </>
                  ) : (
                    <>
                      <strong>{formatGameCount(coverCachedTotal)}</strong> de{' '}
                      <strong>{formatGameCount(coverCatalogTotal)}</strong> em disco
                      {coverUnresolvedTotal > 0 ? (
                        <>
                          {' · '}
                          <strong>{formatGameCount(coverUnresolvedTotal)}</strong> sem capa
                        </>
                      ) : null}
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="settings-block__hint">Importe um catálogo para gerir capas.</p>
            )}

            <details className="settings-details">
              <summary>Índice Steam e opções avançadas</summary>
              <div className="settings-details__body">
                <div className="settings-toggle settings-toggle--select">
                  <span>
                    Índice local
                    {steamAppIndexStatus ? (
                      <>
                        {' — '}
                        <strong>{formatGameCount(steamAppIndexStatus.totalApps)}</strong> jogos ·{' '}
                        {formatSteamIndexUpdatedAt(steamAppIndexStatus.lastUpdatedAt)}
                      </>
                    ) : (
                      ' — carregando…'
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn--compact"
                    disabled={steamAppIndexRefreshing}
                    onClick={() => void onRefreshSteamAppIndex()}
                  >
                    {steamAppIndexRefreshing ? 'Atualizando…' : 'Atualizar'}
                  </button>
                </div>
                <p className="settings-block__hint">
                  Lista completa de jogos Steam para resolver capas mais rápido. Atualiza
                  automaticamente a cada 7 dias. Opcional: <code>STEAM_WEB_API_KEY</code> no{' '}
                  <code>.env</code>.
                </p>
              </div>
            </details>
          </div>
        </section>
      </div>
    </section>
  )
}
