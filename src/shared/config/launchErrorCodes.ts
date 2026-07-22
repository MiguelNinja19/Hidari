import { formatExtractionError } from './downloadErrorCodes'

/** Códigos estáveis devolvidos pelo backend como `launch_error:<code>|...` */
export const LAUNCH_ERROR_MESSAGES: Record<string, string> = {
  path_not_found: 'Pasta não encontrada',
  needs_install: 'Jogo ainda não instalado',
  repack_needs_setup: 'Precisa de setup.exe',
  no_executable: 'Nenhum executável encontrado',
  win32_blocked: 'Falha ao iniciar jogo',
  file_corrupt: 'Windows bloqueou ficheiro',
  no_valid_executable: 'Executável inválido',
  mac_windows_repack_only: 'Repack só no Windows',
  archive_not_found: 'Instalador não encontrado',
  seven_zip_missing: '7-Zip não encontrado',
}

const LAUNCH_ERROR_PREFIX = /^launch_error:([a-z_]+)\|/

export function formatLaunchError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  const coded = msg.match(LAUNCH_ERROR_PREFIX)
  if (coded) {
    const code = coded[1]!
    return LAUNCH_ERROR_MESSAGES[code] ?? (msg.split('|').slice(1).join('|') || msg)
  }
  const extraction = formatExtractionError(msg)
  if (extraction) return extraction
  if (msg.includes('compactado') || msg.includes('no_archive_found')) {
    return LAUNCH_ERROR_MESSAGES.repack_needs_setup!
  }
  if (msg.includes('Setup encontrado') || msg.includes('skipped') || msg.includes('Instalador encontrado')) {
    return 'Use o botão Instalar'
  }
  if (msg.includes('Nenhum instalador') || msg.includes('setup.exe')) {
    return LAUNCH_ERROR_MESSAGES.archive_not_found!
  }
  if (msg.includes('no_executable') || msg.includes('no_viable_executable')) {
    return LAUNCH_ERROR_MESSAGES.needs_install!
  }
  if (msg.includes('launch_target_root_not_found')) {
    return LAUNCH_ERROR_MESSAGES.path_not_found!
  }
  if (msg.includes('7z_not_found')) {
    return LAUNCH_ERROR_MESSAGES.seven_zip_missing!
  }
  if (
    msg.includes('193') ||
    msg.includes('1392') ||
    msg.includes('corrompido') ||
    msg.includes('ilegível') ||
    msg.includes('Win32')
  ) {
    return LAUNCH_ERROR_MESSAGES.file_corrupt!
  }
  // Exit codes crus (PowerShell/processo) — não servem como feedback ao utilizador.
  if (/\bexit(?:\s*code)?\s*:?\s*-?\d+\b/i.test(msg)) {
    return ''
  }
  return msg.replace(/^could_not_launch_game:\s*/i, '') || 'Falha ao iniciar'
}
