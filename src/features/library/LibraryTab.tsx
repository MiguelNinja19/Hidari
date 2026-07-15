import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppDispatch } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useCovers } from '../covers/CoversProvider'
import { LibraryControllerProvider } from './LibraryController'
import { LibraryPage } from './LibraryPage'
import { useLibraryControllerState } from './useLibraryControllerState'
import { useLibraryFolderWatch } from './useLibraryFolderWatch'
import { onLibraryRefreshNeeded } from '../../app/libraryRefreshBridge'

type LibraryTabProps = {
  activeTab: NavTab
  jobs: DownloadJob[]
  queueInitialized: boolean
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
}

export function LibraryTab({
  activeTab,
  jobs,
  queueInitialized,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
}: LibraryTabProps) {
  const { resolveCover, resolveCoversBatch, invalidateLocalCover } = useCovers()
  const { t } = useTranslation()

  const libraryController = useLibraryControllerState({
    activeTab,
    jobs,
    queueInitialized,
    defaultDownloadPath,
    dispatch,
    onGoDiscover,
    onGoDownloads,
    resolveCover,
    resolveCoversBatch,
    invalidateLocalCover,
  })

  useLibraryFolderWatch(() => {
    if (activeTab !== 'library') return
    void libraryController.refreshLibraryScan({ background: true })
  })

  useEffect(() => {
    return onLibraryRefreshNeeded(() => {
      if (activeTab !== 'library') return
      void libraryController.refreshLibraryScan({ background: true })
    })
  }, [activeTab, libraryController.refreshLibraryScan])

  const pendingDelete = libraryController.pendingDeleteItem
  const isDeleting = libraryController.deletingLibraryKey !== null

  return (
    <LibraryControllerProvider value={libraryController}>
      <LibraryPage />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('library.deleteConfirmTitle')}
        description={
          pendingDelete
            ? t('library.deleteConfirmBody', { title: pendingDelete.title })
            : ''
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        busy={isDeleting}
        onConfirm={() => void libraryController.handleConfirmDeleteLibraryItem()}
        onCancel={libraryController.handleCancelDeleteLibraryItem}
      />
    </LibraryControllerProvider>
  )
}
