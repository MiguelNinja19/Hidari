import { useCallback, useState } from 'react'

export function useInstallingKeys() {
  const [installingKeys, setInstallingKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const addInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((previous) => {
      if (previous.has(busyKey)) return previous
      const next = new Set(previous)
      next.add(busyKey)
      return next
    })
  }, [])
  const removeInstallingKey = useCallback((busyKey: string) => {
    setInstallingKeys((previous) => {
      if (!previous.has(busyKey)) return previous
      const next = new Set(previous)
      next.delete(busyKey)
      return next
    })
  }, [])
  return { installingKeys, addInstallingKey, removeInstallingKey }
}
