type ErrorPattern = {
  match: (message: string) => boolean
  message: string
}

export const APP_ERROR_PATTERNS: ErrorPattern[] = [
  {
    match: (m) =>
      m.includes('uninstall_cancelled_or_incomplete') ||
      m.includes('uninstaller_exit_code') ||
      m.includes('could_not_run_uninstaller'),
    message: 'Desinstalação cancelada',
  },
  {
    match: (m) => m.includes('uninstall_partial_failure'),
    message: 'Desinstalação cancelada',
  },
  {
    match: (m) => m.includes('path_outside_default_download_path'),
    message: 'Pasta fora dos downloads',
  },
  {
    match: (m) => m.includes('local_item_not_found'),
    message: 'Pasta não encontrada',
  },
  {
    match: (m) => m.includes('inspect_library_path'),
    message: 'Falha ao verificar instalação',
  },
  {
    match: (m) => m.includes('scan_default_download_path') || m.includes('default_download_path'),
    message: 'Falha ao ler pasta',
  },
  {
    match: (m) => m.includes('game_not_found') || m.includes('catalog_game_not_found'),
    message: 'Jogo não encontrado',
  },
  {
    match: (m) => m.includes('search') && m.includes('failed'),
    message: 'Falha na pesquisa',
  },
  {
    match: (m) => m.includes('enqueue') || m.includes('add_job'),
    message: 'Falha ao enfileirar',
  },
  {
    match: (m) => m.includes('network') || m.includes('fetch') || m.includes('timeout'),
    message: 'Falha de ligação',
  },
]

export function looksTechnical(message: string, isExitCodeNoise: (message: string) => boolean) {
  const trimmed = message.trim()
  if (!trimmed || isExitCodeNoise(trimmed) || trimmed.length > 160) return true
  if (/^[a-z0-9_]+$/i.test(trimmed)) return true
  if (/^(error|failed|panic):/i.test(trimmed)) return true
  return trimmed.includes(' at ') && trimmed.includes('.rs:')
}

export function stripUserErrorNoise(message: string): string {
  return message
    .replace(/^[a-z0-9_]+_failed:\s*/i, '')
    .replace(/^[a-z0-9_]+:\s*/i, '')
    .trim()
}
