import { useEffect } from 'react'
import type { AppDispatch } from '../store'
import { extractStatusReceived, jobProgressReceived } from '../../features/queue/queueSlice'
import { notifyLibraryRefreshNeeded } from '../libraryRefreshBridge'
import { tauriClient } from '../../shared/api/tauri/client'

export function useBootstrapQueueEvents(dispatch: AppDispatch) {
  useEffect(() => {
    let unlistenJob: (() => void) | undefined
    let unlistenExtract: (() => void) | undefined
    void tauriClient.listenJobProgress((event) => {
      dispatch(jobProgressReceived(event))
      if (['completed', 'seeding', 'extracted'].includes(event.status)) {
        notifyLibraryRefreshNeeded()
      }
    }).then((unlisten) => {
      unlistenJob = unlisten
    })
    void tauriClient.listenExtractStatus((event) => {
      dispatch(extractStatusReceived(event))
      if (
        ['extracted', 'completed', 'failed', 'skipped', 'verified', 'verify_failed']
          .includes(event.status)
      ) {
        notifyLibraryRefreshNeeded()
      }
    }).then((unlisten) => {
      unlistenExtract = unlisten
    })
    return () => {
      unlistenJob?.()
      unlistenExtract?.()
    }
  }, [dispatch])
}
