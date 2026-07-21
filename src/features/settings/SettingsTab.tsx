import { useTranslation } from 'react-i18next'
import { useAppSelector } from '../../app/hooks'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useErrorToast } from '../../shared/hooks/useErrorToast'
import { SettingsPage } from './SettingsPage'
import { useCoverPrecache } from './useCoverPrecache'
import { useDownloadSettings } from './useDownloadSettings'
import { useInstallSettings } from './useInstallSettings'
import { useNotificationSettings } from './useNotificationSettings'
import { useSourceAdding } from './useSourceAdding'
import { useSourceManagement } from './useSourceManagement'
import { useSourceSync } from './useSourceSync'

export function SettingsTab() {
  const { t } = useTranslation()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)
  useErrorToast(sourcesError, t('settings.toastSourcesLoadError'))

  const install = useInstallSettings()
  const downloads = useDownloadSettings()
  const notifications = useNotificationSettings()
  const covers = useCoverPrecache()
  const adding = useSourceAdding()
  const management = useSourceManagement()
  const sync = useSourceSync()

  return (
    <>
      <SettingsPage
        {...install}
        {...downloads}
        {...notifications}
        {...covers}
        {...adding}
        {...management}
        {...sync}
        sources={sources}
        sourcesLoading={sourcesLoading}
      />
      <ConfirmDialog
        open={management.pendingDelete !== null}
        title={t('settings.deleteSourceTitle')}
        description={
          management.pendingDelete
            ? t('settings.deleteSourceConfirm', {
                name: management.pendingDelete.name,
              })
            : ''
        }
        confirmLabel={
          management.deletingSourceId
            ? t('settings.deleting')
            : t('common.delete')
        }
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        busy={management.deletingSourceId !== null}
        onConfirm={() => void management.confirmDelete()}
        onCancel={management.cancelDelete}
      />
    </>
  )
}
