import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { DownloadJob } from '../../shared/types/contracts'
import { useCatalogChangeNotifications } from './useCatalogChangeNotifications'
import { useDeepLinkNavigation } from './useDeepLinkNavigation'
import { useDownloadNotifications } from './useDownloadNotifications'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useNotificationNavigation } from './useNotificationNavigation'
import { useQueueSync } from './useQueueSync'
import { useAppUpdater } from './useAppUpdater'
import type { DiscoverBridge } from '../../features/discover/DiscoverTab'
import type { NavTab } from '../../layout/types'
import type { RefObject } from 'react'

type UseAppLifecycleInput = {
  jobs: DownloadJob[]
  sourcesCount: number
  activeTab: NavTab
  setActiveTab: (tab: NavTab) => void
  setDownloadsBooting: (value: boolean) => void
  discoverBridgeRef: RefObject<DiscoverBridge>
  navigateDiscover: () => void
  showSuccess: (message: string) => void
}

export function useAppLifecycle({
  jobs,
  sourcesCount,
  activeTab,
  setActiveTab,
  setDownloadsBooting,
  discoverBridgeRef,
  navigateDiscover,
  showSuccess,
}: UseAppLifecycleInput) {
  const { t } = useTranslation()
  const onReadyToInstall = useCallback(
    (gameTitle: string) => showSuccess(`${t('downloads.notifyReadyToInstall')} · ${gameTitle}`),
    [showSuccess, t],
  )
  const onReadyToPlay = useCallback(
    (gameTitle: string) => showSuccess(`${t('downloads.notifyReadyToPlay')} · ${gameTitle}`),
    [showSuccess, t],
  )

  const updater = useAppUpdater()
  useKeyboardShortcuts({ activeTab, setActiveTab })
  useDownloadNotifications(jobs, { onReadyToInstall, onReadyToPlay })
  useCatalogChangeNotifications(sourcesCount > 0)
  useNotificationNavigation({ onNavigate: setActiveTab })
  useQueueSync({ activeTab, setDownloadsBooting })
  useDeepLinkNavigation({
    onNavigateDiscover: navigateDiscover,
    applyDiscoverSearch: (query) => discoverBridgeRef.current?.applyDiscoverSearch(query),
    openGameDetail: (input) => discoverBridgeRef.current?.openGameDetail(input),
  })

  return updater
}
