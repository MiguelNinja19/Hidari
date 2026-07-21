import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { useConfirmDialog } from '../../shared/components/useConfirmDialog'

type LibraryAddGameModalProps = {
  open: boolean
  busy: boolean
  defaultPath?: string
  onClose: () => void
  onSubmit: (path: string, title?: string) => Promise<void>
}

function pathLeaf(value: string) {
  return value.split(/[/\\]/).filter(Boolean).pop() ?? value
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
  const pathInputRef = useRef<HTMLInputElement>(null)
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (!open) return
    setPath('')
    setTitle('')
    const timer = window.setTimeout(() => pathInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const applySelection = useCallback((selected: string) => {
    setPath(selected)
    setTitle((current) => {
      if (current.trim()) return current
      const leaf = pathLeaf(selected)
      return leaf.replace(/\.(exe|url|lnk)$/i, '') || leaf
    })
  }, [])

  const browseShortcut = useCallback(async () => {
    const selected = await open({
      multiple: false,
      title: t('library.addGameBrowseShortcut'),
      defaultPath: path.trim() || defaultPath || undefined,
      filters: [{ name: t('library.addGameFilter'), extensions: ['exe', 'url', 'lnk'] }],
    })
    if (typeof selected === 'string') applySelection(selected)
  }, [applySelection, defaultPath, path, t])

  const browseFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('library.addGameBrowseFolder'),
      defaultPath: path.trim() || defaultPath || undefined,
    })
    if (typeof selected === 'string') applySelection(selected)
  }, [applySelection, defaultPath, path, t])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const trimmedPath = path.trim()
      if (!trimmedPath || busy) return
      await onSubmit(trimmedPath, title.trim() || undefined)
    },
    [busy, onSubmit, path, title],
  )

  const canSubmit = Boolean(path.trim()) && !busy

  if (!open) return null

  return createPortal(
    <div
      className="pick-modal-backdrop confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="pick-modal confirm-dialog library-add-game-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <form className="library-add-game-dialog__form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="confirm-dialog__body">
            <h2 id={titleId} className="confirm-dialog__title">
              {t('library.addGameModalTitle')}
            </h2>
            <p id={descId} className="confirm-dialog__desc">
              {t('library.addGameModalDesc')}
            </p>

            <div className="library-add-game-dialog__fields">
              <label className="library-add-game-dialog__label" htmlFor="library-add-game-path">
                {t('library.addGamePathLabel')}
              </label>
              <div className="library-add-game-dialog__path-row">
                <input
                  ref={pathInputRef}
                  id="library-add-game-path"
                  className="library-add-game-dialog__input"
                  value={path}
                  disabled={busy}
                  placeholder={t('library.addGamePathPlaceholder')}
                  onChange={(event) => setPath(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn-outline btn--compact"
                  disabled={busy}
                  onClick={() => void browseShortcut()}
                >
                  {t('library.addGameBrowseShortcut')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn--compact"
                  disabled={busy}
                  onClick={() => void browseFolder()}
                >
                  {t('library.addGameBrowseFolder')}
                </button>
              </div>

              <label className="library-add-game-dialog__label" htmlFor="library-add-game-title">
                {t('library.addGameTitleLabel')}
              </label>
              <input
                id="library-add-game-title"
                className="library-add-game-dialog__input"
                value={title}
                disabled={busy}
                placeholder={t('library.addGameTitlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="confirm-dialog__actions">
            <button
              type="button"
              className="btn btn-outline btn--compact"
              disabled={busy}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={`btn btn-primary btn--compact confirm-dialog__confirm${busy ? ' is-busy' : ''}`}
              disabled={!canSubmit}
            >
              {busy ? <span className="btn__spinner" aria-hidden /> : null}
              <span>{busy ? t('library.addGameAdding') : t('library.sidebarAdd')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
