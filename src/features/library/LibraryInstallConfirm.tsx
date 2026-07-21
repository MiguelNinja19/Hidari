import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { LibraryEntry } from './types'

type LibraryInstallConfirmProps = {
  pendingInstall: LibraryEntry | null
  confirmInstallBusy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function LibraryInstallConfirm({
  pendingInstall,
  confirmInstallBusy,
  onConfirm,
  onCancel,
}: LibraryInstallConfirmProps) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      open={pendingInstall !== null}
      title={t('library.installConfirmTitle')}
      description={
        pendingInstall
          ? t('library.installConfirmBody', { title: cleanTitleForDisplay(pendingInstall.title) })
          : ''
      }
      confirmLabel={t('common.install')}
      cancelLabel={t('common.cancel')}
      confirmVariant="primary"
      busy={confirmInstallBusy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
