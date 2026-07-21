import { useMemo, useState } from 'react'
import {
  AFTER_INSTALL_ACTION_DEFAULT,
  INSTALL_ORGANIZATION_DEFAULT,
} from '../../shared/config/appSettings'
import { useAppBootstrap } from '../hooks/useAppBootstrap'

export function useAppSettingsState() {
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('')
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState('ilimitado')
  const [installOrganization, setInstallOrganization] = useState(INSTALL_ORGANIZATION_DEFAULT)
  const [afterInstallAction, setAfterInstallAction] = useState(AFTER_INSTALL_ACTION_DEFAULT)
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])
  const [disabledSourcesReady, setDisabledSourcesReady] = useState(false)
  const [notifyReadyToInstall, setNotifyReadyToInstall] = useState(true)
  const [notifyReadyToPlay, setNotifyReadyToPlay] = useState(true)
  const [notifyCatalogChanges, setNotifyCatalogChanges] = useState(false)

  useAppBootstrap({
    setDefaultDownloadPath,
    setSeedTorrentsEnabled,
    setInstallOrganization,
    setAfterInstallAction,
    setRemoveTemporaryFiles,
    setDownloadSpeedLimit,
    setDisabledSourceIds,
    setDisabledSourcesReady,
    setNotifyReadyToInstall,
    setNotifyReadyToPlay,
    setNotifyCatalogChanges,
  })

  return useMemo(() => ({
    defaultDownloadPath, setDefaultDownloadPath,
    seedTorrentsEnabled, setSeedTorrentsEnabled,
    removeTemporaryFiles, setRemoveTemporaryFiles,
    downloadSpeedLimit, setDownloadSpeedLimit,
    installOrganization, setInstallOrganization,
    afterInstallAction, setAfterInstallAction,
    disabledSourceIds, setDisabledSourceIds, disabledSourcesReady,
    notifyReadyToInstall, setNotifyReadyToInstall,
    notifyReadyToPlay, setNotifyReadyToPlay,
    notifyCatalogChanges, setNotifyCatalogChanges,
  }), [
    afterInstallAction, defaultDownloadPath, disabledSourceIds, disabledSourcesReady,
    downloadSpeedLimit, installOrganization, notifyCatalogChanges,
    notifyReadyToInstall, notifyReadyToPlay, removeTemporaryFiles, seedTorrentsEnabled,
  ])
}
