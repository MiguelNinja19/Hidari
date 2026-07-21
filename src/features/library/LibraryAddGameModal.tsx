import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useConfirmDialog } from '../../shared/components/useConfirmDialog'

type LibraryAddGameModalProps = {
  open: boolean
  busy: boolean
  defaultPath?: string
  onClose: () => void
  onSubmit: (path: string) => Promise<void>
}

function pathLeaf(value: string) {
  return value.split(/[/\\]/).filter(Boolean).pop() ?? value
}

function normalizeDialogPath(selected: string | string[] | null): string | null {
  if (selected == null) return null
  if (typeof selected === 'string') {
    const trimmed = selected.trim()
    return trimmed || null
  }
  const first = selected[0]?.trim()
  return first || null
}

export function LibraryAddGameModal({
  open,
  busy,
  defaultPath,
  onClose,
  onSubmit,
}: LibraryAddGameModalProps) {
  const { t } = useTranslation()
  const { titleId, descId, dialogRef } = useConfirmDialog(open, busy, onClose)
  const pickingRef = useRef(false)
  const [picking, setPicking] = useState(false)
  const [pendingName, setPendingName] = useState('')

  useEffect(() => {
    if (!open) return
    setPendingName('')
    setPicking(false)
    pickingRef.current = false
  }, [open])

  const pickAndAdd = useCallback(
    async (mode: 'shortcut' | 'folder') => {
      if (busy || pickingRef.current) return
      pickingRef.current = true
      setPicking(true)
      try {
        const selected = normalizeDialogPath(
          await openDialog(
            mode === 'folder'
              ? {
                  directory: true,
                  multiple: false,
                  title: t('library.addGameBrowseFolder'),
                  defaultPath: defaultPath || undefined,
                }
              : {
                  multiple: false,
                  title: t('library.addGameBrowseShortcut'),
                  defaultPath: defaultPath || undefined,
                  filters: [
                    { name: t('library.addGameFilter'), extensions: ['exe', 'url', 'lnk'] },
                    { name: t('library.addGameFilterAll'), extensions: ['*'] },
                  ],
                },
          ),
        )
        if (!selected) return
        setPendingName(pathLeaf(selected))
        await onSubmit(selected)
      } finally {
        pickingRef.current = false
        setPicking(false)
      }
    },
    [busy, defaultPath, onSubmit, t],
  )

  const locked = busy || picking
  const statusText = busy
    ? t('library.addGameAdding')
    : picking
      ? t('library.addGamePicking')
      : pendingName
        ? t('library.addGameAddingName', { name: pendingName })
        : t('library.addGamePickHint')

  if (!open) return null

  return createPortal(
    <div
      className="pick-modal-backdrop confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="pick-modal confirm-dialog library-add-game-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={locked || undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="library-add-game-dialog__form">
          <div className="confirm-dialog__body">
            <h2 id={titleId} className="confirm-dialog__title">
              {t('library.addGameModalTitle')}
            </h2>
            <p id={descId} className="confirm-dialog__desc">
              {t('library.addGameModalDesc')}
            </p>

            <div
              className="library-add-game-dialog__choices"
              role="group"
              aria-label={t('library.addGameChooseSource')}
            >
              <button
                type="button"
                className="library-add-game-dialog__choice"
                disabled={locked}
                onClick={() => void pickAndAdd('shortcut')}
              >
                <span className="library-add-game-dialog__choice-label">
                  {t('library.addGameBrowseShortcut')}
                </span>
                <span className="library-add-game-dialog__choice-hint">
                  {t('library.addGameBrowseShortcutHint')}
                </span>
              </button>
              <button
                type="button"
                className="library-add-game-dialog__choice"
                disabled={locked}
                onClick={() => void pickAndAdd('folder')}
              >
                <span className="library-add-game-dialog__choice-label">
                  {t('library.addGameBrowseFolder')}
                </span>
                <span className="library-add-game-dialog__choice-hint">
                  {t('library.addGameBrowseFolderHint')}
                </span>
              </button>
            </div>

            <p
              className={`library-add-game-dialog__hint${locked ? ' library-add-game-dialog__hint--busy' : ''}`}
              aria-live="polite"
            >
              {locked ? <span className="btn__spinner" aria-hidden /> : null}
              <span>{statusText}</span>
            </p>
          </div>

          <div className="confirm-dialog__actions">
            <button
              type="button"
              className="btn btn-outline btn--compact"
              disabled={locked}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
