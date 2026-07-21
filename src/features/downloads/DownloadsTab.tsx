import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../app/hooks'
import { useNavigation } from '../../app/context/NavigationContext'
import { useToast } from '../../shared/components/ToastProvider'
import { useErrorToast } from '../../shared/hooks/useErrorToast'
import { useCovers } from '../covers/CoversProvider'
import { DownloadsPage } from './DownloadsPage'
import {
  formatProgressPercent,
  isTorrentMetadataPhase,
  resolveJobProgressPercent,
} from '../../shared/utils/jobProgress'
import type { DownloadJob } from '../../shared/types/contracts'
import { useDownloadActions } from './useDownloadActions'

type DownloadsTabProps = {
  jobs: DownloadJob[]
  queueError: string | null
}

export function DownloadsTab({
  jobs,
  queueError,
}: DownloadsTabProps) {
  const dispatch = useAppDispatch()
  const { navigateLibrary } = useNavigation()
  const { resolveCover, invalidateLocalCover } = useCovers()
  const { showError } = useToast()
  const { t } = useTranslation()
  useErrorToast(queueError, t('downloads.queueError'))
  const actions = useDownloadActions(jobs, dispatch, showError, t)

  return (
    <DownloadsPage
      jobs={jobs}
      isTorrentMetadataPhase={isTorrentMetadataPhase}
      resolveJobProgressPercent={resolveJobProgressPercent}
      formatProgressPercent={formatProgressPercent}
      {...actions}
      onGoLibrary={navigateLibrary}
      resolveCover={resolveCover}
      invalidateLocalCover={invalidateLocalCover}
    />
  )
}
