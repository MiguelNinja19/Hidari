import { useEffect } from 'react'
import { tauriClient } from '../../shared/api/tauri/client'

const LIBRARY_FOLDER_CHANGED = 'library://folder-changed'

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

export { LIBRARY_FOLDER_CHANGED }
