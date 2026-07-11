import { useTranslation } from 'react-i18next'
import {
  APP_LANGUAGES,
  isAppLanguage,
  type AppLanguage,
} from '../../shared/config/locale'
import { setAppLanguage } from '../../shared/i18n'
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
  onDeleteSource: (sourceId: string, sourceName: string) => void | Promise<void>
  onSyncSource: (sourceId: string, sourceName: string) => Promise<void>
  onSyncAllSources: () => Promise<void>
  deletingSourceId: string | null
  syncingSourceId: string | null
  syncingAllSources: boolean
  handleToggleSource: (sourceId: string) => void | Promise<void>
  handleToggleRemoveTemp: (next: boolean) => Promise<void>
  handleToggleSeed: (enabled: boolean) => Promise<void>
  handleSpeedLimitChange: (value: string) => Promise<void>
  /** Enquanto false, os switches de fonte ficam desativados (settings ainda a carregar). */
  disabledSourcesReady?: boolean
}

export function SettingsPage({
  defaultDownloadPath,
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
  setDefaultDownloadPath,
  setInstallOrganization,
  setAfterInstallAction,
  disabledSourcesReady = true,
}: SettingsPageProps) {
  const { t, i18n } = useTranslation()
  const currentLanguage: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'pt-BR'
  const isSyncingAll = syncingAllSources

  return (
    <section className="settings-page">
      <div className="settings-stack">
        <section id="settings-language" className="settings-block settings-block--wide">
          <header className="settings-block__head">
            <div className="settings-block__head-copy">
              <h2 className="settings-block__title">{t('settings.languageTitle')}</h2>
            </div>
          </header>
          <div className="settings-block__body">
            <label className="settings-field settings-field--stack">
              <select
                className="settings-input"
                value={currentLanguage}
                aria-label={t('settings.languageTitle')}
                onChange={(event) => {
                  const next = event.target.value
                  if (isAppLanguage(next)) void setAppLanguage(next)
                }}
              >
                {APP_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="settings-stack__row">
          <section id="settings-folder" className="settings-block">
            <header className="settings-block__head">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">{t('settings.installTitle')}</h2>
              </div>
            </header>

            <div className="settings-block__body">
              <label className="settings-field settings-field--stack">
                <span>{t('settings.destinationFolder')}</span>
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
                    {t('common.browse')}
                  </button>
                </div>
              </label>

              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>{t('settings.folderOrganization')}</span>
                  <select
                    className="settings-input"
                    value={installOrganization}
                    onChange={(event) => setInstallOrganization(event.target.value)}
                  >
                    <option value="separate-folder">{t('settings.orgSeparate')}</option>
                    <option value="single-folder">{t('settings.orgSingle')}</option>
                  </select>
                </label>

                <label className="settings-field">
                  <span>{t('settings.afterInstall')}</span>
                  <select
                    className="settings-input"
                    value={afterInstallAction}
                    onChange={(event) => setAfterInstallAction(event.target.value)}
                  >
                    <option value="ask">{t('settings.afterAsk')}</option>
                    <option value="open-folder">{t('settings.afterOpenFolder')}</option>
                    <option value="launch-game">{t('settings.afterLaunch')}</option>
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
                {t('common.save')}
              </button>
            </footer>
          </section>

          <section id="settings-downloads" className="settings-block">
            <header className="settings-block__head">
              <div className="settings-block__head-copy">
                <h2 className="settings-block__title">{t('settings.downloadsTitle')}</h2>
              </div>
            </header>

            <div className="settings-block__body settings-block__body--tight">
              <label className="settings-toggle settings-toggle--select">
                <span>{t('settings.speedLimit')}</span>
                <select
                  className="settings-input settings-input--narrow"
                  value={downloadSpeedLimit}
                  onChange={(event) => void handleSpeedLimitChange(event.target.value)}
                >
                  <option value="ilimitado">{t('settings.speedUnlimited')}</option>
                  <option value="50mb">50 MB/s</option>
                  <option value="20mb">20 MB/s</option>
                  <option value="10mb">10 MB/s</option>
                </select>
              </label>

              <div className="settings-toggle">
                <span>{t('settings.removeTemp')}</span>
                <button
                  type="button"
                  className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label={t('settings.removeTempAria')}
                  onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
                />
              </div>

              <div className="settings-toggle">
                <span>{t('settings.seedAfter')}</span>
                <button
                  type="button"
                  className={seedTorrentsEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label={t('settings.seedAria')}
                  onClick={() => void handleToggleSeed(!seedTorrentsEnabled)}
                />
              </div>
            </div>
          </section>
        </div>

        <section id="settings-catalog" className="settings-block settings-block--wide">
          <header className="settings-block__head">
            <div className="settings-block__head-actions">
              <button
                type="button"
                className="btn btn-outline btn--compact"
                disabled={addingSource}
                onClick={() => void onOpenCatalogsFolder()}
              >
                {t('settings.openCatalogFolder')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn--compact"
                disabled={addingSource}
                onClick={() => void onImportSource()}
              >
                {addingSource ? t('settings.importing') : t('common.import')}
              </button>
              {sources.length > 0 ? (
                <button
                  type="button"
                  className={`btn btn-outline btn--compact${isSyncingAll ? ' btn--busy' : ''}`}
                  disabled={isSyncingAll || addingSource || sourcesLoading}
                  aria-busy={isSyncingAll}
                  onClick={() => void onSyncAllSources()}
                >
                  {isSyncingAll ? (
                    <>
                      <span className="btn__spinner" aria-hidden />
                      {t('settings.syncingAll')}
                    </>
                  ) : (
                    t('settings.syncAll')
                  )}
                </button>
              ) : null}
            </div>
          </header>

          <div className="settings-block__body">
            <label className="settings-field settings-field--stack">
              <span>{t('settings.catalogUrl')}</span>
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
                  {addingSource ? t('settings.adding') : t('common.add')}
                </button>
              </div>
            </label>

            {sources.length > 0 ? (
              <div className="settings-source-table-wrap">
                <ul className="settings-source-table settings-source-table--simple" role="list">
                  {sources.map((source) => {
                    const enabled = isSourceEnabled(source.id)
                    const isSourceSyncing = syncingSourceId === source.id
                    const isSourceDeleting = deletingSourceId === source.id
                    return (
                      <li
                        key={source.id}
                        className={`settings-source-row${enabled ? '' : ' settings-source-row--off'}`}
                      >
                        <div className="settings-source-table__col settings-source-table__col--name">
                          <strong className="settings-source-row__name">{source.name}</strong>
                          <span className="settings-source-row__count-inline">
                            {source.downloadCount > 0
                              ? t('settings.gamesCount', {
                                  count: source.downloadCount.toLocaleString(i18n.language),
                                })
                              : t('settings.gamesCountEmpty')}
                          </span>
                        </div>
                        <div className="settings-source-table__col settings-source-table__col--on">
                          <button
                            type="button"
                            className={enabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                            disabled={
                              !disabledSourcesReady || isSourceSyncing || isSourceDeleting
                            }
                            aria-pressed={enabled}
                            aria-label={
                              enabled
                                ? t('settings.disableSource', { name: source.name })
                                : t('settings.enableSource', { name: source.name })
                            }
                            onClick={() => void handleToggleSource(source.id)}
                          />
                        </div>
                        <div className="settings-source-table__col settings-source-table__col--actions">
                          <div
                            className="settings-source-actions"
                            role="group"
                            aria-label={t('settings.sourceActions', { name: source.name })}
                          >
                            <button
                              type="button"
                              className={`btn btn-outline btn--compact settings-source-actions__btn${
                                isSourceSyncing ? ' btn--busy' : ''
                              }`}
                              disabled={isSourceSyncing || isSourceDeleting}
                              aria-busy={isSourceSyncing}
                              onClick={() => void onSyncSource(source.id, source.name)}
                            >
                              {isSourceSyncing ? (
                                <>
                                  <span className="btn__spinner" aria-hidden />
                                  {t('settings.syncing')}
                                </>
                              ) : (
                                t('common.sync')
                              )}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn--compact settings-source-actions__btn"
                              disabled={isSourceSyncing || isSourceDeleting}
                              aria-label={t('common.delete')}
                              onClick={() => void onDeleteSource(source.id, source.name)}
                            >
                              {isSourceDeleting ? t('settings.deleting') : t('common.delete')}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  )
}
