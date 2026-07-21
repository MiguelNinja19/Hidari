import type { CoverPrecacheStatus, Source } from '../../shared/types/contracts'

export type SettingsPageProps = {
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
  handleToggleNotifyReadyToInstall: (enabled: boolean) => Promise<void>
  handleToggleNotifyReadyToPlay: (enabled: boolean) => Promise<void>
  handleToggleNotifyCatalogChanges: (enabled: boolean) => Promise<void>
  handleTestNotification: () => Promise<void>
  notifyTestBusy?: boolean
  coverPrecacheStatus: CoverPrecacheStatus | null
  coverPrecacheBusy: boolean
  onStartCoverPrecache: () => Promise<void>
  onStopCoverPrecache: () => Promise<void>
  onRetryUnresolvedCovers: () => Promise<void>
}
