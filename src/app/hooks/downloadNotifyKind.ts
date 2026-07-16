export type DownloadNotifySnapshot = {
  status: string
  extractionStatus?: string | null
  progress?: number
  bytesDownloaded?: number
  totalBytes?: number
}

export type DownloadNotifyKind = 'install' | 'play' | null

const MIN_READY_BYTES = 5 * 1024 * 1024

/** Download já transferiu o conteúdo real (não só metadados/placeholder). */
export function isDownloadReadyForNotify(snapshot: DownloadNotifySnapshot): boolean {
  if ((snapshot.progress ?? 0) >= 99) return true
  const total = snapshot.totalBytes ?? 0
  const done = snapshot.bytesDownloaded ?? 0
  return total >= MIN_READY_BYTES && done >= total * 0.995
}

function isReadyToInstall(snapshot: DownloadNotifySnapshot): boolean {
  if (snapshot.extractionStatus === 'pending_content') return false
  if (snapshot.extractionStatus !== 'skipped') return false
  if (
    snapshot.status !== 'completed' &&
    snapshot.status !== 'seeding' &&
    snapshot.status !== 'skipped'
  ) {
    return false
  }
  return isDownloadReadyForNotify(snapshot)
}

/**
 * Decide se uma transição de job deve notificar o utilizador.
 * - install: pronto para instalar (setup.exe / extract skipped) com download completo
 * - play: pronto para jogar (extracted)
 * - null: sem notificação (ex.: completed ainda a preparar / metadados)
 */
export function resolveDownloadNotifyKind(
  prev: DownloadNotifySnapshot | null | undefined,
  next: DownloadNotifySnapshot,
): DownloadNotifyKind {
  if (!prev) return null

  const prevKey = `${prev.status}|${prev.extractionStatus ?? ''}|${isReadyToInstall(prev)}`
  const nextKey = `${next.status}|${next.extractionStatus ?? ''}|${isReadyToInstall(next)}`
  if (prevKey === nextKey) return null

  if (next.status === 'extracted' && prev.status !== 'extracted') {
    return 'play'
  }

  if (!isReadyToInstall(next)) return null
  if (isReadyToInstall(prev)) return null

  return 'install'
}
