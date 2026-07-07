import { useEffect, useState } from 'react'
import { appApi } from '../../shared/api/tauri/appApi'

export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void appApi
      .appVersion()
      .then((value) => {
        if (!cancelled) setVersion(value)
      })
      .catch(() => {
        if (!cancelled) setVersion(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return version
}
