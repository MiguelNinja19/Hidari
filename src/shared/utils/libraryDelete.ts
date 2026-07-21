export { resolveLibraryDeletePaths } from './libraryDeletePaths'

export function isFileLockDeleteError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return (
    msg.includes('os error 32') ||
    msg.includes('error 32') ||
    msg.includes('being used by another process') ||
    msg.includes('utilizado por outro processo') ||
    msg.includes('sendo usado por outro processo') ||
    msg.includes('used by another process')
  )
}

export function isBenignDeleteError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return (
    msg.includes('local_item_not_found') ||
    msg.includes('path_outside_default_download_path') ||
    msg.includes('cannot_delete_default_download_root')
  )
}

export function formatLibraryDeleteError(errors: unknown[]): string {
  if (errors.length === 0) return ''

  if (errors.some(isFileLockDeleteError)) {
    return 'Não foi possível apagar os arquivos porque estão em uso. Feche o instalador do jogo (Setup) e apague a pasta manualmente, se necessário. O jogo já foi removido da biblioteca.'
  }

  const first = errors[0]
  const msg = first instanceof Error ? first.message : String(first ?? '')
  if (msg.includes('cannot_delete_default_download_root')) {
    return 'Não é possível apagar a pasta raiz de downloads. O jogo foi removido da biblioteca.'
  }

  return msg.trim() || 'Falha ao excluir item.'
}

/** Se o modal deve correr uninstall antes de apagar a pasta de download. */
export function shouldUninstallInstalledFiles(
  deleteInstalledChecked: boolean,
  installedPaths: string[],
): boolean {
  return deleteInstalledChecked && installedPaths.length > 0
}
