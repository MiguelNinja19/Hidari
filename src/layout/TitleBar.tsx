import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'

const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

export function TitleBar() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isTauriRuntime()) return

    const window = getCurrentWindow()
    let disposed = false

    const syncMaximized = async () => {
      const next = await window.isMaximized()
      if (!disposed) setMaximized(next)
    }

    void syncMaximized()

    const unlistenPromise = window.onResized(() => {
      void syncMaximized()
    })

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  if (!isTauriRuntime()) return null

  const window = getCurrentWindow()

  return (
    <header className="titlebar">
      <div className="titlebar__drag" data-tauri-drag-region>
        <span className="titlebar__title">Hidari</span>
      </div>
      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__btn"
          aria-label={t('titlebar.minimize')}
          onClick={() => {
            void window.minimize()
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6h8" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__btn"
          aria-label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
          onClick={() => {
            void window.toggleMaximize()
          }}
        >
          {maximized ? (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3.5 2.5h5v5H3.5zM2 4v6h6" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.5" y="2.5" width="7" height="7" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          aria-label={t('titlebar.close')}
          onClick={() => {
            void window.close()
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </header>
  )
}
