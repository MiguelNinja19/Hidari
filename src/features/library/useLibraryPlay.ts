import { useCallback, useRef, useState } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { useToast } from '../../shared/components/ToastProvider'
import { formatLaunchError } from '../../shared/utils/launchErrors'
import { getPathState, itemPathCtx, pathStateKey } from './libraryItemState'
import type { PathStateMap, PathStateSetter } from './libraryControllerTypes'
import type { LibraryEntry } from './types'

/** Evita relançar o mesmo jogo enquanto ainda está a arrancar. */
const PLAY_COOLDOWN_MS = 4000

type Args = {
  pathStateByKeyRef: React.MutableRefObject<PathStateMap>
  setPathStateByKey?: PathStateSetter
}

export function useLibraryPlay(args: Args) {
  const { showError } = useToast()
  const [playBusyId, setPlayBusyId] = useState<string | null>(null)
  const playLocksRef = useRef<Set<string>>(new Set())
  const cooldownUntilByKeyRef = useRef<Map<string, number>>(new Map())

  const handlePlayLibraryItem = useCallback(async (item: LibraryEntry) => {
    const key = item.kind === 'job' ? item.id : item.destPath
    if (playLocksRef.current.has(key)) return
    const coolUntil = cooldownUntilByKeyRef.current.get(key) ?? 0
    if (Date.now() < coolUntil) return

    playLocksRef.current.add(key)
    setPlayBusyId(key)
    const jobId = item.kind === 'job' ? item.id : undefined
    const stateKey = pathStateKey(item.destPath, itemPathCtx(item))
    try {
      const preferredExe = getPathState(
        item.destPath,
        args.pathStateByKeyRef.current,
        itemPathCtx(item),
      )?.launchPath
      await sourcesApi.launchGame(
        item.title,
        item.destPath,
        jobId,
        preferredExe,
      )
      cooldownUntilByKeyRef.current.set(key, Date.now() + PLAY_COOLDOWN_MS)
    } catch (error) {
      // Preferred exe inválido/stale: limpar e deixar o próximo Play re-resolver.
      if (args.setPathStateByKey) {
        args.setPathStateByKey((prev) => {
          const current = prev[stateKey]
          if (!current?.launchPath) return prev
          const next = { ...current, launchPath: null }
          return { ...prev, [stateKey]: next }
        })
      }
      const message = formatLaunchError(error)
      if (message.trim()) showError(message)
    } finally {
      playLocksRef.current.delete(key)
      setPlayBusyId((current) => (current === key ? null : current))
    }
  }, [args, showError])

  return { playBusyId, handlePlayLibraryItem }
}
