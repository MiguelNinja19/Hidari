export type DownloadNotifySnapshot = {
  status: string
  extractionStatus?: string | null
}

export type DownloadNotifyKind = 'install' | 'play' | null

/**
 * Decide se uma transição de job deve notificar o utilizador.
 * - install: pronto para instalar (setup.exe / extract skipped)
 * - play: pronto para jogar (extracted)
 * - null: sem notificação (ex.: completed ainda a preparar)
 */
export function resolveDownloadNotifyKind(
  prev: DownloadNotifySnapshot | null | undefined,
  next: DownloadNotifySnapshot,
): DownloadNotifyKind {
  if (!prev) return null

  const prevKey = `${prev.status}|${prev.extractionStatus ?? ''}`
  const nextKey = `${next.status}|${next.extractionStatus ?? ''}`
  if (prevKey === nextKey) return null

  if (next.status === 'extracted' && prev.status !== 'extracted') {
    return 'play'
  }

  const nextReadyToInstall =
    next.extractionStatus === 'skipped' &&
    (next.status === 'completed' || next.status === 'seeding' || next.status === 'skipped')

  if (!nextReadyToInstall) return null

  const prevReadyToInstall =
    prev.extractionStatus === 'skipped' &&
    (prev.status === 'completed' || prev.status === 'seeding' || prev.status === 'skipped')

  if (prevReadyToInstall) return null

  return 'install'
}
