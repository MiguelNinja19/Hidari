import type { FormEvent } from 'react'
import type { Source } from '../../shared/types/contracts'

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
  verifyAfterDownload: boolean
  removeTemporaryFiles: boolean
  seedTorrentsEnabled: boolean
  downloadSpeedLimit: string
  canSubmitSource: boolean
  isSourceEnabled: (sourceId: string) => boolean
  setSourceUrl: (value: string) => void
  setDefaultDownloadPath: (value: string) => void
  setInstallOrganization: (value: string) => void
  setAfterInstallAction: (value: string) => void
  handleSelectDefaultPath: () => Promise<void>
  handleSaveInstallSettings: () => Promise<void>
  handleAddSource: (event: FormEvent<HTMLFormElement>) => void
  handleToggleSource: (sourceId: string) => void
  handleToggleVerify: (next: boolean) => Promise<void>
  handleToggleRemoveTemp: (next: boolean) => Promise<void>
  handleToggleSeed: (enabled: boolean) => Promise<void>
  handleSpeedLimitChange: (value: string) => Promise<void>
  formatSize: (bytes?: number) => string
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
  verifyAfterDownload,
  removeTemporaryFiles,
  seedTorrentsEnabled,
  downloadSpeedLimit,
  canSubmitSource,
  isSourceEnabled,
  setSourceUrl,
  setDefaultDownloadPath,
  setInstallOrganization,
  setAfterInstallAction,
  handleSelectDefaultPath,
  handleSaveInstallSettings,
  handleAddSource,
  handleToggleSource,
  handleToggleVerify,
  handleToggleRemoveTemp,
  handleToggleSeed,
  handleSpeedLimitChange,
  formatSize,
}: SettingsPageProps) {
  return (
    <section className="settings-page">
      <div className="settings-stack">
        <section className="settings-block">
          <h2 className="settings-block__title">Pasta</h2>
          <div className="settings-inline">
            <input
              className="settings-input"
              placeholder="C:\\Games"
              value={defaultDownloadPath}
              onChange={(event) => setDefaultDownloadPath(event.target.value)}
            />
            <button className="btn btn-outline btn--compact" type="button" onClick={() => void handleSelectDefaultPath()}>
              Escolher
            </button>
          </div>
          <p className="settings-block__hint">
            Livre: {diskFreeBytes != null ? formatSize(diskFreeBytes) : '—'}
          </p>

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

          <button className="btn btn-primary btn--compact" type="button" onClick={() => void handleSaveInstallSettings()}>
            Guardar
          </button>
          {savePathError ? <p className="browse-note browse-note--error">{savePathError}</p> : null}
        </section>

        <section className="settings-block">
          <h2 className="settings-block__title">Fontes</h2>
          <ul className="settings-sources">
            {sources.map((source) => (
              <li key={source.id} className="settings-source">
                <div className="settings-source__copy">
                  <strong>{source.name}</strong>
                  <span>{source.url.replace(/^https?:\/\//, '')}</span>
                </div>
                <button
                  type="button"
                  className={isSourceEnabled(source.id) ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label={`Ativar ${source.name}`}
                  onClick={() => handleToggleSource(source.id)}
                />
              </li>
            ))}
          </ul>
          {sourcesLoading ? <p className="settings-block__hint">A carregar…</p> : null}
          {sourcesError ? <p className="browse-note browse-note--error">{sourcesError}</p> : null}
          <form onSubmit={handleAddSource} className="settings-inline">
            <input
              className="settings-input"
              placeholder="URL da fonte (.json)"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
            <button className="btn btn-outline btn--compact" type="submit" disabled={!canSubmitSource}>
              Adicionar
            </button>
          </form>
        </section>

        <section className="settings-block">
          <h2 className="settings-block__title">Opções</h2>

          <div className="settings-toggle">
            <span>Verificar ficheiros após download</span>
            <button
              type="button"
              className={verifyAfterDownload ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label="Verificar ficheiros"
              onClick={() => void handleToggleVerify(!verifyAfterDownload)}
            />
          </div>

          <label className="settings-field settings-field--row">
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
            <span>Apagar ficheiros temporários</span>
            <button
              type="button"
              className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label="Apagar temporários"
              onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
            />
          </div>

          <div className="settings-toggle">
            <span>Semear torrent após concluir</span>
            <button
              type="button"
              className={seedTorrentsEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label="Semear torrent"
              onClick={() => void handleToggleSeed(!seedTorrentsEnabled)}
            />
          </div>
        </section>
      </div>
    </section>
  )
}
