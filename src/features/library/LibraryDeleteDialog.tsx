import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import type { LibraryControllerValue } from './LibraryController'

export function LibraryDeleteDialog({
  controller,
}: {
  controller: LibraryControllerValue
}) {
  const { t } = useTranslation()
  const pending = controller.pendingDeleteItem
  const deleting = controller.deletingLibraryKey !== null

  return (
    <ConfirmDialog
      open={pending !== null}
      title={t('library.deleteConfirmTitle')}
      description={
        pending
          ? t('library.deleteConfirmBody', {
              title: cleanTitleForDisplay(pending.title),
            })
          : ''
      }
      confirmLabel={t('library.uninstall')}
      busyLabel={t('library.deleting')}
      cancelLabel={t('common.cancel')}
      confirmVariant="danger"
      busy={deleting}
      onConfirm={() => void controller.handleConfirmDeleteLibraryItem()}
      onCancel={controller.handleCancelDeleteLibraryItem}
    />
  )
}
