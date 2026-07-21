import type { Dispatch, SetStateAction } from 'react'

export type BootstrapSettings = {
  setDefaultDownloadPath: Dispatch<SetStateAction<string>>
  setSeedTorrentsEnabled: Dispatch<SetStateAction<boolean>>
  setInstallOrganization: Dispatch<SetStateAction<string>>
  setAfterInstallAction: Dispatch<SetStateAction<string>>
  setRemoveTemporaryFiles: Dispatch<SetStateAction<boolean>>
  setDownloadSpeedLimit: Dispatch<SetStateAction<string>>
  setDisabledSourceIds: Dispatch<SetStateAction<string[]>>
  setDisabledSourcesReady: Dispatch<SetStateAction<boolean>>
  setNotifyReadyToInstall: Dispatch<SetStateAction<boolean>>
  setNotifyReadyToPlay: Dispatch<SetStateAction<boolean>>
  setNotifyCatalogChanges: Dispatch<SetStateAction<boolean>>
}

export function parseDisabledSourceIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value
    }
  } catch {
    // JSON inválido
  }
  return []
}
