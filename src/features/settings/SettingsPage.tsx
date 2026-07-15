import { useState, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  APP_LANGUAGES,
  isAppLanguage,
  type AppLanguage,
} from '../../shared/config/locale'
import { EXAMPLE_SOURCE_URL } from '../../shared/config/hydraLinks'
import { setAppLanguage } from '../../shared/i18n'
import type { Source } from '../../shared/types/contracts'
import { formatSize } from '../../shared/utils/formatters'

type AddMethod = 'url' | 'json'

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
  setDefaultDownloadPath: (value: string) => void
  setInstallOrganization: (value: string) => void
  setAfterInstallAction: (value: string) => void
  handleSelectDefaultPath: () => Promise<void>
  handleSaveInstallSettings: () => Promise<void>
  onOpenCatalogsFolder: () => Promise<void>
  onAddSourceByUrl: () => Promise<void>
  onImportSource: () => Promise<void>
  onOpenHydraLinksSite: () => Promise<void>
  onDeleteSource: (sourceId: string, sourceName: string) => void | Promise<void>
  onSyncSource: (sourceId: string, sourceName: string) => Promise<void>
  onSyncAllSources: () => Promise<void>
  onToggleSourceEnabled: (sourceId: string, enable: boolean) => Promise<void>
  disabledSourceIds: string[]
  disabledSourcesReady: boolean
  deletingSourceId: string | null
  syncingSourceId: string | null
  syncingAllSources: boolean
  handleToggleRemoveTemp: (next: boolean) => Promise<void>
  handleToggleSeed: (enabled: boolean) => Promise<void>
  handleSpeedLimitChange: (value: string) => Promise<void>
  minimizeToTray: boolean
  handleToggleMinimizeToTray: (enabled: boolean) => Promise<void>
  notifyReadyToInstall: boolean
  notifyReadyToPlay: boolean
  notifyCatalogChanges: boolean
  notifySound: boolean
  handleToggleNotifyReadyToInstall: (enabled: boolean) => Promise<void>
  handleToggleNotifyReadyToPlay: (enabled: boolean) => Promise<void>
  handleToggleNotifyCatalogChanges: (enabled: boolean) => Promise<void>
  handleToggleNotifySound: (enabled: boolean) => Promise<void>
  handleTestNotification: () => Promise<void>
  notifyTestBusy?: boolean
  coverPrecacheStatus: {
    running: boolean
    total: number
    processed: number
    cached: number
    downloaded: number
    unresolved: number
    failed: number
  } | null
  coverPrecacheBusy: boolean
  onStartCoverPrecache: () => Promise<void>
  onStopCoverPrecache: () => Promise<void>
  onRetryUnresolvedCovers: () => Promise<void>
}

function stopSummaryToggle(event: ReactMouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
  defaultOpen = true,
}: {
  id: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      id={id}
      className="set-card"
      {...({ defaultOpen } as HTMLAttributes<HTMLDetailsElement>)}
    >      <summary className="set-card__summary">
        <div className="set-card__titles">
          <p className="set-card__label">{title}</p>
          <p className="set-card__desc">{description}</p>
        </div>
        {actions ? (
          <div className="set-card__actions" onClick={stopSummaryToggle}>
            {actions}
          </div>
        ) : null}
        <span className="set-card__chevron" aria-hidden />
      </summary>
      <div className="set-card__body">{children}</div>
    </details>
  )
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
  handleSelectDefaultPath,
  handleSaveInstallSettings,
  onOpenCatalogsFolder,
  onAddSourceByUrl,
  onImportSource,
  onOpenHydraLinksSite,
  onDeleteSource,
  onSyncSource,
  onSyncAllSources,
  onToggleSourceEnabled,
  disabledSourceIds,
  disabledSourcesReady,
  deletingSourceId,
  syncingSourceId,
  syncingAllSources,
  handleToggleRemoveTemp,
  handleToggleSeed,
  handleSpeedLimitChange,
  setDefaultDownloadPath,
  setInstallOrganization,
  setAfterInstallAction,
  minimizeToTray,
  handleToggleMinimizeToTray,
  notifyReadyToInstall,
  notifyReadyToPlay,
  notifyCatalogChanges,
  notifySound,
  handleToggleNotifyReadyToInstall,
  handleToggleNotifyReadyToPlay,
  handleToggleNotifyCatalogChanges,
  handleToggleNotifySound,
  handleTestNotification,
  notifyTestBusy,
  coverPrecacheStatus,
  coverPrecacheBusy,
  onStartCoverPrecache,
  onStopCoverPrecache,
  onRetryUnresolvedCovers,
}: SettingsPageProps) {
  const { t, i18n } = useTranslation()
  const [addMethod, setAddMethod] = useState<AddMethod>('url')
  const currentLanguage: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'pt-BR'
  const isSyncingAll = syncingAllSources
  const canAddUrl = sourceUrlInput.trim().length > 0
  const freeSpaceLabel =
    diskFreeBytes != null && diskFreeBytes >= 0
      ? t('settings.freeSpace', { size: formatSize(diskFreeBytes) })
      : null
  const catalogMeta =
    sources.length > 0
      ? t('settings.catalogSourcesCount', { count: sources.length })
      : t('settings.catalogSourcesNone')

  return (
    <section className="set-page">
      <div className="set-grid">
        <SettingsSection
          id="settings-language"
          title={t('settings.languageTitle')}
          description={t('settings.languageDesc')}
        >
          <label className="set-field">
            <span className="set-field__label">{t('settings.languageLabel')}</span>
            <select
              className="set-input set-input--select"
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
        </SettingsSection>

        <SettingsSection
          id="settings-downloads"
          title={t('settings.downloadsTitle')}
          description={t('settings.downloadsDesc')}
        >
          <label className="set-field set-field--row">
            <span className="set-field__label">{t('settings.speedLimit')}</span>
            <select
              className="set-input set-input--select set-input--narrow"
              value={downloadSpeedLimit}
              onChange={(event) => void handleSpeedLimitChange(event.target.value)}
            >
              <option value="ilimitado">{t('settings.speedUnlimited')}</option>
              <option value="50mb">50 MB/s</option>
              <option value="20mb">20 MB/s</option>
              <option value="10mb">10 MB/s</option>
            </select>
          </label>

          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.removeTemp')}</span>
              <span className="set-switch__hint">{t('settings.removeTempHint')}</span>
            </div>
            <button
              type="button"
              className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.removeTempAria')}
              onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
            />
          </div>

          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.seedAfter')}</span>
              <span className="set-switch__hint">{t('settings.seedHint')}</span>
            </div>
            <button
              type="button"
              className={seedTorrentsEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.seedAria')}
              onClick={() => void handleToggleSeed(!seedTorrentsEnabled)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-folder"
          title={t('settings.installTitle')}
          description={t('settings.installDesc')}
          actions={
            <button
              className="set-btn set-btn--primary set-card__action"
              type="button"
              onClick={() => void handleSaveInstallSettings()}
            >
              {t('common.save')}
            </button>
          }
        >
          <div className="set-card__body--grid">
            <div className="set-field set-field--span">
              <span className="set-field__label">{t('settings.destinationFolder')}</span>
              {freeSpaceLabel ? <span className="set-field__hint">{freeSpaceLabel}</span> : null}
              <div className="set-input-group">
                <input
                  className="set-input set-input--grow"
                  placeholder="C:\\Games"
                  value={defaultDownloadPath}
                  onChange={(event) => setDefaultDownloadPath(event.target.value)}
                />
                <button
                  className="set-btn set-btn--secondary"
                  type="button"
                  onClick={() => void handleSelectDefaultPath()}
                >
                  {t('common.browse')}
                </button>
              </div>
            </div>

            <label className="set-field">
              <span className="set-field__label">{t('settings.folderOrganization')}</span>
              <select
                className="set-input set-input--select"
                value={installOrganization}
                onChange={(event) => setInstallOrganization(event.target.value)}
              >
                <option value="separate-folder">{t('settings.orgSeparate')}</option>
                <option value="single-folder">{t('settings.orgSingle')}</option>
              </select>
            </label>

            <label className="set-field">
              <span className="set-field__label">{t('settings.afterInstall')}</span>
              <select
                className="set-input set-input--select"
                value={afterInstallAction}
                onChange={(event) => setAfterInstallAction(event.target.value)}
              >
                <option value="ask">{t('settings.afterAsk')}</option>
                <option value="open-folder">{t('settings.afterOpenFolder')}</option>
                <option value="launch-game">{t('settings.afterLaunch')}</option>
              </select>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-tray"
          title={t('settings.trayTitle')}
          description={t('settings.trayDesc')}
        >
          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.minimizeToTray')}</span>
              <span className="set-switch__hint">{t('settings.minimizeToTrayHint')}</span>
            </div>
            <button
              type="button"
              className={minimizeToTray ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.minimizeToTrayAria')}
              onClick={() => void handleToggleMinimizeToTray(!minimizeToTray)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-notifications"
          title={t('settings.notificationsTitle')}
          description={t('settings.notificationsDesc')}
        >
          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.notifyReadyToInstall')}</span>
              <span className="set-switch__hint">{t('settings.notifyReadyToInstallHint')}</span>
            </div>
            <button
              type="button"
              className={notifyReadyToInstall ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.notifyReadyToInstall')}
              onClick={() => void handleToggleNotifyReadyToInstall(!notifyReadyToInstall)}
            />
          </div>
          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.notifyReadyToPlay')}</span>
              <span className="set-switch__hint">{t('settings.notifyReadyToPlayHint')}</span>
            </div>
            <button
              type="button"
              className={notifyReadyToPlay ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.notifyReadyToPlay')}
              onClick={() => void handleToggleNotifyReadyToPlay(!notifyReadyToPlay)}
            />
          </div>
          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.notifyCatalogChanges')}</span>
              <span className="set-switch__hint">{t('settings.notifyCatalogChangesHint')}</span>
            </div>
            <button
              type="button"
              className={notifyCatalogChanges ? 'switch-btn switch-btn--on' : 'switch-btn'}
              aria-label={t('settings.notifyCatalogChanges')}
              onClick={() => void handleToggleNotifyCatalogChanges(!notifyCatalogChanges)}
            />
          </div>
          <div className="set-switch">
            <div className="set-switch__copy">
              <span className="set-switch__label">{t('settings.notifySound')}</span>
              <span className="set-switch__hint">{t('settings.notifySoundHint')}</span>
            </div>
            <div className="set-switch__controls">
              <button
                type="button"
                className="set-btn set-btn--secondary set-btn--compact"
                disabled={notifyTestBusy}
                onClick={() => void handleTestNotification()}
              >
                {notifyTestBusy ? t('settings.notifyTestBusy') : t('settings.notifyTest')}
              </button>
              <button
                type="button"
                className={notifySound ? 'switch-btn switch-btn--on' : 'switch-btn'}
                aria-label={t('settings.notifySound')}
                onClick={() => void handleToggleNotifySound(!notifySound)}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-covers"
          title={t('settings.coversTitle')}
          description={t('settings.coversDesc')}
          defaultOpen={false}
        >
          {coverPrecacheStatus ? (
            <p className="set-field__hint">
              {coverPrecacheStatus.running
                ? t('settings.coversProgress', {
                    processed: coverPrecacheStatus.processed,
                    total: coverPrecacheStatus.total,
                    cached: coverPrecacheStatus.cached,
                  })
                : t('settings.coversIdle', {
                    cached: coverPrecacheStatus.cached,
                    unresolved: coverPrecacheStatus.unresolved,
                    failed: coverPrecacheStatus.failed,
                  })}
            </p>
          ) : (
            <p className="set-field__hint">{t('settings.coversIdleEmpty')}</p>
          )}
          <div className="set-card__actions set-card__actions--inline">
            <button
              type="button"
              className="set-btn set-btn--primary set-btn--compact"
              disabled={coverPrecacheBusy || Boolean(coverPrecacheStatus?.running)}
              onClick={() => void onStartCoverPrecache()}
            >
              {t('settings.coversStart')}
            </button>
            <button
              type="button"
              className="set-btn set-btn--secondary set-btn--compact"
              disabled={coverPrecacheBusy || !coverPrecacheStatus?.running}
              onClick={() => void onStopCoverPrecache()}
            >
              {t('settings.coversStop')}
            </button>
            <button
              type="button"
              className="set-btn set-btn--secondary set-btn--compact"
              disabled={coverPrecacheBusy || Boolean(coverPrecacheStatus?.running)}
              onClick={() => void onRetryUnresolvedCovers()}
            >
              {t('settings.coversRetry')}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          id="settings-catalog"
          title={t('settings.catalogTitle')}
          description={catalogMeta}
          actions={
            <>
              <button
                type="button"
                className="set-btn set-btn--secondary"
                disabled={addingSource}
                onClick={() => void onOpenCatalogsFolder()}
              >
                {t('settings.openCatalogFolder')}
              </button>
              {sources.length > 0 ? (
                <button
                  type="button"
                  className={`set-btn set-btn--sync${isSyncingAll ? ' is-busy' : ''}`}
                  disabled={isSyncingAll || addingSource || sourcesLoading}
                  aria-busy={isSyncingAll}
                  onClick={() => void onSyncAllSources()}
                >
                  {isSyncingAll ? (
                    <>
                      <span className="set-btn__spinner" aria-hidden />
                      {t('settings.syncingAll')}
                    </>
                  ) : (
                    t('settings.syncAll')
                  )}
                </button>
              ) : null}
            </>
          }
        >
          <div className="set-add">
            <div className="set-add__toolbar">
              <div
                className="set-add__tabs"
                role="tablist"
                aria-label={t('settings.addSourceChooseLabel')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMethod === 'url'}
                  className={`set-add__tab${addMethod === 'url' ? ' is-active' : ''}`}
                  disabled={addingSource}
                  onClick={() => setAddMethod('url')}
                >
                  {t('settings.addSourceByUrlTitle')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addMethod === 'json'}
                  className={`set-add__tab${addMethod === 'json' ? ' is-active' : ''}`}
                  disabled={addingSource}
                  onClick={() => setAddMethod('json')}
                >
                  {t('settings.addSourceByFileTitle')}
                </button>
              </div>

              {addMethod === 'json' ? (
                <button
                  type="button"
                  className="set-btn set-btn--primary set-add__submit"
                  disabled={addingSource}
                  onClick={() => void onImportSource()}
                >
                  {addingSource ? t('settings.importing') : t('settings.importJsonFile')}
                </button>
              ) : null}
            </div>

            <div className="set-add__body">
              {addMethod === 'url' ? (
                <div className="set-add__panel">
                  <div className="set-add__row set-add__row--inline">
                    <input
                      className="set-input set-input--grow"
                      type="url"
                      placeholder={EXAMPLE_SOURCE_URL}
                      value={sourceUrlInput}
                      disabled={addingSource}
                      aria-label={t('settings.catalogUrl')}
                      onChange={(event) => setSourceUrlInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && canAddUrl) {
                          event.preventDefault()
                          void onAddSourceByUrl()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="set-btn set-btn--primary set-add__submit"
                      disabled={addingSource || !canAddUrl}
                      onClick={() => void onAddSourceByUrl()}
                    >
                      {addingSource ? t('settings.adding') : t('settings.addSourceConfirm')}
                    </button>
                  </div>
                  <div className="set-add__example">
                    <span className="set-add__example-label">
                      {t('settings.addSourceExampleLabel')}
                    </span>
                    <button
                      type="button"
                      className="set-add__example-url"
                      disabled={addingSource}
                      title={t('settings.addSourceUseExample')}
                      onClick={() => setSourceUrlInput(EXAMPLE_SOURCE_URL)}
                    >
                      {EXAMPLE_SOURCE_URL}
                    </button>
                    <button
                      type="button"
                      className="set-add__link"
                      disabled={addingSource}
                      onClick={() => void onOpenHydraLinksSite()}
                    >
                      {t('settings.openHydraLinks')}
                    </button>
                  </div>
                </div>
              ) : null}

              {addMethod === 'json' ? (
                <div className="set-add__format">
                  <p className="set-add__hint">{t('settings.addSourceJsonFormatHint')}</p>
                  <pre className="set-add__code" tabIndex={0}>
                    {`{
  "name": "Minha fonte",
  "downloads": [
    {
      "title": "Nome do jogo",
      "fileSize": "10 GB",
      "uris": ["magnet:?xt=urn:btih:..."]
    }
  ]
}`}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>

          {sources.length === 0 && !sourcesLoading ? (
            <div className="set-empty">
              <p className="set-empty__title">{t('settings.noSourcesHint')}</p>
              <p className="set-empty__text">{t('settings.catalogEmptyHint')}</p>
            </div>
          ) : null}

          {sources.length > 0 ? (
            <ul className="set-sources" role="list">
              {sources.map((source) => {
                const isSourceSyncing = syncingSourceId === source.id
                const isSourceDeleting = deletingSourceId === source.id
                const sourceEnabled = !disabledSourceIds.includes(source.id)
                return (
                  <li
                    key={source.id}
                    className={`set-source${sourceEnabled ? '' : ' set-source--disabled'}`}
                  >
                    <div className="set-source__main">
                      <strong className="set-source__name">{source.name}</strong>
                      <span className="set-source__meta">
                        {source.downloadCount > 0
                          ? t('settings.gamesCount', {
                            count: source.downloadCount.toLocaleString(i18n.language),
                          })
                          : t('settings.gamesCountEmpty')}
                      </span>
                    </div>
                    <div
                      className="set-source__actions"
                      role="group"
                      aria-label={t('settings.sourceActions', { name: source.name })}
                    >
                      <button
                        type="button"
                        className={sourceEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                        disabled={!disabledSourcesReady || isSourceDeleting}
                        aria-pressed={sourceEnabled}
                        aria-label={
                          sourceEnabled
                            ? t('settings.disableSource', { name: source.name })
                            : t('settings.enableSource', { name: source.name })
                        }
                        onClick={() =>
                          void onToggleSourceEnabled(source.id, !sourceEnabled)
                        }
                      />
                      <button
                        type="button"
                        className={`set-btn set-btn--sync set-btn--compact${isSourceSyncing ? ' is-busy' : ''}`}
                        disabled={isSourceSyncing || isSourceDeleting}
                        aria-busy={isSourceSyncing}
                        onClick={() => void onSyncSource(source.id, source.name)}
                      >
                        {isSourceSyncing ? (
                          <>
                            <span className="set-btn__spinner" aria-hidden />
                            {t('settings.syncing')}
                          </>
                        ) : (
                          t('common.sync')
                        )}
                      </button>
                      <button
                        type="button"
                        className="set-btn set-btn--danger set-btn--compact"
                        disabled={isSourceSyncing || isSourceDeleting}
                        aria-label={t('common.delete')}
                        onClick={() => void onDeleteSource(source.id, source.name)}
                      >
                        {isSourceDeleting ? t('settings.deleting') : t('common.delete')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </SettingsSection>
      </div>
    </section>
  )
}
