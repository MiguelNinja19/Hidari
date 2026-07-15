import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'

/** Tamanho único da janela restaurada — evita layouts quebrados ao redimensionar. */
const WINDOW_WIDTH = 1280
const WINDOW_HEIGHT = 816

const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !==
    'undefined'

async function lockRestoredSize() {
  const appWindow = getCurrentWindow()
  const size = new LogicalSize(WINDOW_WIDTH, WINDOW_HEIGHT)
  await appWindow.setMinSize(size)
  await appWindow.setMaxSize(size)
}

async function unlockForMaximize() {
  const appWindow = getCurrentWindow()
  await appWindow.setMaxSize(null)
}

export function TitleBar() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)
  const togglingRef = useRef(false)

  useEffect(() => {
    if (!isTauriRuntime()) return

    const appWindow = getCurrentWindow()
    let disposed = false

    const syncMaximized = async () => {
      if (togglingRef.current) return
      const next = await appWindow.isMaximized()
      if (!disposed) setMaximized(next)
    }

    void (async () => {
      const isMax = await appWindow.isMaximized()
      if (disposed) return
      if (!isMax) {
        await lockRestoredSize()
      }
      setMaximized(isMax)
    })()

    const unlistenPromise = appWindow.onResized(() => {
      void syncMaximized()
    })

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  if (!isTauriRuntime()) return null

  const appWindow = getCurrentWindow()

  const toggleMaximize = async () => {
    togglingRef.current = true
    try {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize()
        await lockRestoredSize()
        await appWindow.setSize(new LogicalSize(WINDOW_WIDTH, WINDOW_HEIGHT))
        setMaximized(false)
        return
      }

      await unlockForMaximize()
      await appWindow.maximize()
      setMaximized(true)
    } finally {
      togglingRef.current = false
    }
  }

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
            void appWindow.minimize()
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
            void toggleMaximize()
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
            void appWindow.close()
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
