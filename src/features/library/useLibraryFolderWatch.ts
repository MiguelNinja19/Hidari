import { useEffect } from 'react'
import { tauriClient } from '../../shared/api/tauri/client'

/** Reage a alterações na pasta de downloads (evento Tauri). */
export function useLibraryFolderWatch(onChanged: () => void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined
    void tauriClient
      .listenLibraryFolderChanged(() => {
        onChanged()
      })
      .then((fn) => {
        unlisten = fn
      })
    return () => {
      unlisten?.()
    }
  }, [onChanged])
}
