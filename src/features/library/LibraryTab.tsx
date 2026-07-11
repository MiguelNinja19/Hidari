import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppDispatch } from '../../app/store'
import type { DownloadJob } from '../../shared/types/contracts'
import type { NavTab } from '../../layout/types'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { CoversProvider, useCovers } from '../covers/CoversProvider'
import { LibraryControllerProvider } from './LibraryController'
import { LibraryPage } from './LibraryPage'
import { useLibraryControllerState } from './useLibraryControllerState'
import { useLibraryFolderWatch } from './useLibraryFolderWatch'
import { onLibraryRefreshNeeded } from '../../app/libraryRefreshBridge'

type LibraryTabProps = {
  jobs: DownloadJob[]
  queueInitialized: boolean
  defaultDownloadPath: string
  dispatch: AppDispatch
  onGoDiscover: () => void
  onGoDownloads: () => void
  onRegisterRefreshScan: (fn: ((options?: { background?: boolean }) => void) | null) => void
}

function LibraryTabInner({
  jobs,
  queueInitialized,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
  onRegisterRefreshScan,
}: LibraryTabProps) {
  const { resolveCover, resolveCoversBatch, invalidateLocalCover } = useCovers()
  const { t } = useTranslation()

  const libraryController = useLibraryControllerState({
    activeTab: 'library' satisfies NavTab,
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
    void libraryController.refreshLibraryScan({ background: true })
  })

  useEffect(() => {
    onRegisterRefreshScan(() => {
      void libraryController.refreshLibraryScan({ background: true })
    })
    return () => onRegisterRefreshScan(null)
  }, [libraryController.refreshLibraryScan, onRegisterRefreshScan])

  useEffect(() => {
    return onLibraryRefreshNeeded(() => {
      void libraryController.refreshLibraryScan({ background: true })
    })
  }, [libraryController.refreshLibraryScan])

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

export function LibraryTab(props: LibraryTabProps) {
  const catalogGames = useMemo(
    () =>
      props.jobs.map((job) => ({
        id: `job:${job.id}`,
        title: job.title,
        genre: '',
        coverUrl: null,
        localCoverPath: null,
        source: 'queue',
      })),
    [props.jobs],
  )

  const preloadTitles = useMemo(() => props.jobs.map((job) => job.title), [props.jobs])

  return (
    <CoversProvider
      catalogGames={catalogGames}
      jobs={props.jobs}
      eager
      preloadTitles={preloadTitles}
    >
      <LibraryTabInner {...props} />
    </CoversProvider>
  )
}
