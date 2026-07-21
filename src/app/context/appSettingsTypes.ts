import type { Dispatch, SetStateAction } from 'react'

export type AppSettingsContextValue = {
  defaultDownloadPath: string
  setDefaultDownloadPath: Dispatch<SetStateAction<string>>
  seedTorrentsEnabled: boolean
  setSeedTorrentsEnabled: Dispatch<SetStateAction<boolean>>
  removeTemporaryFiles: boolean
  setRemoveTemporaryFiles: Dispatch<SetStateAction<boolean>>
  downloadSpeedLimit: string
  setDownloadSpeedLimit: Dispatch<SetStateAction<string>>
  installOrganization: string
  setInstallOrganization: Dispatch<SetStateAction<string>>
  afterInstallAction: string
  setAfterInstallAction: Dispatch<SetStateAction<string>>
  disabledSourceIds: string[]
  setDisabledSourceIds: Dispatch<SetStateAction<string[]>>
  disabledSourcesReady: boolean
  notifyReadyToInstall: boolean
  setNotifyReadyToInstall: Dispatch<SetStateAction<boolean>>
  notifyReadyToPlay: boolean
  setNotifyReadyToPlay: Dispatch<SetStateAction<boolean>>
  notifyCatalogChanges: boolean
  setNotifyCatalogChanges: Dispatch<SetStateAction<boolean>>
}
