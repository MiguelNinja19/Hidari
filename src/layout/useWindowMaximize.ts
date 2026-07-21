import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'

const WINDOW_SIZE = new LogicalSize(1280, 816)

export const isTauriRuntime = () =>
  typeof window !== 'undefined' &&
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined

async function lockRestoredSize() {
  const appWindow = getCurrentWindow()
  await appWindow.setMinSize(WINDOW_SIZE)
  await appWindow.setMaxSize(WINDOW_SIZE)
}

export function useWindowMaximize() {
  const [maximized, setMaximized] = useState(false)
  const togglingRef = useRef(false)

  useEffect(() => {
    if (!isTauriRuntime()) return
    const appWindow = getCurrentWindow()
    let disposed = false
    const sync = async () => {
      if (togglingRef.current) return
      const next = await appWindow.isMaximized()
      if (!disposed) setMaximized(next)
    }
    void (async () => {
      const isMax = await appWindow.isMaximized()
      if (disposed) return
      if (!isMax) await lockRestoredSize()
      setMaximized(isMax)
    })()
    const unlistenPromise = appWindow.onResized(() => void sync())
    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const toggleMaximize = async () => {
    const appWindow = getCurrentWindow()
    togglingRef.current = true
    try {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize()
        await lockRestoredSize()
        await appWindow.setSize(WINDOW_SIZE)
        setMaximized(false)
      } else {
        await appWindow.setMaxSize(null)
        await appWindow.maximize()
        setMaximized(true)
      }
    } finally {
      togglingRef.current = false
    }
  }

  return { maximized, toggleMaximize }
}
