import { formatLaunchError } from './launchErrors'

const FALLBACK = 'Ocorreu um erro inesperado. Tente novamente.'

type ErrorPattern = {
  match: (message: string) => boolean
  message: string
}

const APP_ERROR_PATTERNS: ErrorPattern[] = [
  {
    match: (m) => m.includes('path_outside_default_download_path'),
    message: 'A pasta está fora do diretório de downloads configurado em Configurações.',
  },
  {
    match: (m) => m.includes('local_item_not_found'),
    message: 'Não encontrámos essa pasta na biblioteca.',
  },
  {
    match: (m) => m.includes('inspect_library_path'),
    message: 'Não foi possível verificar a instalação do jogo.',
  },
  {
    match: (m) => m.includes('scan_default_download_path') || m.includes('default_download_path'),
    message: 'Não foi possível ler a pasta de downloads. Verifique o caminho em Configurações.',
  },
  {
    match: (m) => m.includes('game_not_found') || m.includes('catalog_game_not_found'),
    message: 'Jogo não encontrado no catálogo.',
  },
  {
    match: (m) => m.includes('search') && m.includes('failed'),
    message: 'Não foi possível pesquisar o catálogo. Tente outra vez.',
  },
  {
    match: (m) => m.includes('enqueue') || m.includes('add_job'),
    message: 'Não foi possível adicionar o download à fila.',
  },
  {
    match: (m) => m.includes('network') || m.includes('fetch') || m.includes('timeout'),
    message: 'Falha de ligação. Verifique a internet e tente novamente.',
  },
]

function looksTechnical(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (trimmed.length > 160) return true
  if (/^[a-z0-9_]+$/i.test(trimmed)) return true
  if (/^(error|failed|panic):/i.test(trimmed)) return true
  if (trimmed.includes(' at ') && trimmed.includes('.rs:')) return true
  return false
}

function stripNoise(message: string): string {
  return message
    .replace(/^[a-z0-9_]+_failed:\s*/i, '')
    .replace(/^[a-z0-9_]+:\s*/i, '')
    .trim()
}

export function formatUserError(error: unknown, fallback = FALLBACK): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return fallback

  const launchFormatted = formatLaunchError(error)
  if (launchFormatted !== trimmed && !launchFormatted.includes('launch_error:')) {
    return launchFormatted
  }

  for (const pattern of APP_ERROR_PATTERNS) {
    if (pattern.match(trimmed)) return pattern.message
  }

  const cleaned = stripNoise(trimmed)
  if (!cleaned || looksTechnical(cleaned)) return fallback

  if (cleaned.endsWith('.') || cleaned.endsWith('!') || cleaned.endsWith('?')) {
    return cleaned
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`
}
