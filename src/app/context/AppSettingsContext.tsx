import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useAppBootstrap } from '../hooks/useAppBootstrap'
import {
  AFTER_INSTALL_ACTION_DEFAULT,
  INSTALL_ORGANIZATION_DEFAULT,
} from '../../shared/config/appSettings'

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
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('')
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState('ilimitado')
  const [installOrganization, setInstallOrganization] = useState(INSTALL_ORGANIZATION_DEFAULT)
  const [afterInstallAction, setAfterInstallAction] = useState(AFTER_INSTALL_ACTION_DEFAULT)
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])

  useAppBootstrap({
    setDefaultDownloadPath,
    setSeedTorrentsEnabled,
    setInstallOrganization,
    setAfterInstallAction,
    setRemoveTemporaryFiles,
    setDownloadSpeedLimit,
    setDisabledSourceIds,
  })

  const value = useMemo(
    () => ({
      defaultDownloadPath,
      setDefaultDownloadPath,
      seedTorrentsEnabled,
      setSeedTorrentsEnabled,
      removeTemporaryFiles,
      setRemoveTemporaryFiles,
      downloadSpeedLimit,
      setDownloadSpeedLimit,
      installOrganization,
      setInstallOrganization,
      afterInstallAction,
      setAfterInstallAction,
      disabledSourceIds,
      setDisabledSourceIds,
    }),
    [
      afterInstallAction,
      defaultDownloadPath,
      disabledSourceIds,
      downloadSpeedLimit,
      installOrganization,
      removeTemporaryFiles,
      seedTorrentsEnabled,
    ],
  )

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}
