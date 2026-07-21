import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmDialog } from './useConfirmDialog'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel: string
  confirmVariant?: 'danger' | 'primary'
  busy?: boolean
  busyLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'danger',
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { titleId, descId, dialogRef } = useConfirmDialog(open, busy, onCancel)
  const actionLabel = busy && busyLabel ? busyLabel : confirmLabel

  if (!open) return null

  return createPortal(
    <div
      className="pick-modal-backdrop confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="pick-modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <div className="confirm-dialog__body">
          <h2 id={titleId} className="confirm-dialog__title">
            {title}
          </h2>
          <div id={descId} className="confirm-dialog__desc">
            {description}
          </div>
        </div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn btn-outline btn--compact"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn--compact confirm-dialog__confirm ${
              confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'
            }${busy ? ' is-busy' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <span className="btn__spinner" aria-hidden /> : null}
            <span>{actionLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
