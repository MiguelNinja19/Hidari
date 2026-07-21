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
  const external = pending?.external === true

  return (
    <ConfirmDialog
      open={pending !== null}
      title={external ? t('library.removeConfirmTitle') : t('library.deleteConfirmTitle')}
      description={
        pending
          ? t(external ? 'library.removeConfirmBody' : 'library.deleteConfirmBody', {
              title: cleanTitleForDisplay(pending.title),
            })
          : ''
      }
      confirmLabel={external ? t('library.removeFromLibrary') : t('library.uninstall')}
      busyLabel={external ? t('library.removing') : t('library.deleting')}
      cancelLabel={t('common.cancel')}
      confirmVariant="danger"
      busy={deleting}
      onConfirm={() => void controller.handleConfirmDeleteLibraryItem()}
      onCancel={controller.handleCancelDeleteLibraryItem}
    />
  )
}
