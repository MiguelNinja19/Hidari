import { useEffect, useState } from 'react'

/** Espelha `plugins.updater.active` em tauri.conf.json. */
export const UPDATER_ENABLED = false

type UpdaterState = {
  checking: boolean
  updateAvailable: boolean
  version: string | null
  error: string | null
}

const initialState: UpdaterState = {
  checking: false,
  updateAvailable: false,
  version: null,
  error: null,
}

/** Verifica atualizações quando o updater Tauri está ativo. */
export function useAppUpdater(enabled = UPDATER_ENABLED) {
  const [state, setState] = useState<UpdaterState>(initialState)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const run = async () => {
      setState((prev) => ({ ...prev, checking: true, error: null }))
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (cancelled) return
        setState({
          checking: false,
          updateAvailable: Boolean(update),
          version: update?.version ?? null,
          error: null,
        })
      } catch (error) {
        if (cancelled) return
        setState({
          checking: false,
          updateAvailable: false,
          version: null,
          error: error instanceof Error ? error.message : 'Falha ao verificar atualizações.',
        })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
