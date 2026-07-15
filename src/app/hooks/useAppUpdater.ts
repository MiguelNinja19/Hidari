import { useCallback, useEffect, useRef, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'

/** Em `tauri:dev` o endpoint ainda não existe — evita spam de ERROR no log. Releases usam check real. */
const UPDATER_ENABLED = import.meta.env.PROD

type UpdaterState = {
  checking: boolean
  updateAvailable: boolean
  version: string | null
  error: string | null
  installing: boolean
  dismissed: boolean
  installUpdate: () => Promise<void>
  dismiss: () => void
}

const initialState = {
  checking: false,
  updateAvailable: false,
  version: null as string | null,
  error: null as string | null,
  installing: false,
  dismissed: false,
}

/** Verifica atualizações quando o updater Tauri está ativo (só builds de produção). */
export function useAppUpdater(enabled = UPDATER_ENABLED): UpdaterState {
  const [checking, setChecking] = useState(initialState.checking)
  const [updateAvailable, setUpdateAvailable] = useState(initialState.updateAvailable)
  const [version, setVersion] = useState<string | null>(initialState.version)
  const [error, setError] = useState<string | null>(initialState.error)
  const [installing, setInstalling] = useState(initialState.installing)
  const [dismissed, setDismissed] = useState(initialState.dismissed)
  const updateRef = useRef<Update | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const run = async () => {
      setChecking(true)
      setError(null)
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (cancelled) {
          await update?.close().catch(() => {})
          return
        }
        updateRef.current = update
        setChecking(false)
        setUpdateAvailable(Boolean(update))
        setVersion(update?.version ?? null)
        setError(null)
      } catch {
        // Sem release / endpoint 404: silencioso até existir latest.json no GitHub.
        if (cancelled) return
        updateRef.current = null
        setChecking(false)
        setUpdateAvailable(false)
        setVersion(null)
        setError(null)
      }
    }

    void run()
    return () => {
      cancelled = true
      const pending = updateRef.current
      updateRef.current = null
      void pending?.close().catch(() => {})
    }
  }, [enabled])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  const installUpdate = useCallback(async () => {
    const update = updateRef.current
    if (!update || installing) return
    setInstalling(true)
    setError(null)
    try {
      await update.downloadAndInstall()
      setUpdateAvailable(false)
      updateRef.current = null
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setInstalling(false)
    }
  }, [installing])

  return {
    checking,
    updateAvailable,
    version,
    error,
    installing,
    dismissed,
    installUpdate,
    dismiss,
  }
}
