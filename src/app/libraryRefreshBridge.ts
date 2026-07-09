type LibraryRefreshListener = () => void

const listeners = new Set<LibraryRefreshListener>()

export function onLibraryRefreshNeeded(listener: LibraryRefreshListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyLibraryRefreshNeeded(): void {
  for (const listener of listeners) {
    listener()
  }
}
