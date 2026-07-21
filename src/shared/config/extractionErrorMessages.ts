import { resolveSourcePasswordHint, type SourcePasswordHint } from './sourcePasswordHints'

export const EXTRACTION_ERROR_MESSAGES = {
  cannotOpen:
    'Arquivo inválido ou incompleto. Verifique o download (e se faltam partes .r00 / .part2) e tente extrair de novo.',
  unsupportedMethod:
    'Este arquivo usa um formato que o extrator não consegue abrir. Tente extrair com o WinRAR/7-Zip do sistema ou use Instalar se houver setup.exe.',
  busy: 'Já existe uma extração em andamento. Aguarde terminar.',
  noArchive:
    'Não encontrei .zip/.rar/.7z nesta pasta do download. Se o arquivo tiver senha, abra a pasta e extraia com WinRAR/7-Zip (o launcher não pede senha). Se houver setup.exe, use Instalar.',
  passwordRequired:
    'Abra a pasta e extraia com WinRAR ou 7-Zip usando a senha do site da fonte.',
  generic:
    'Não foi possível extrair o arquivo. Confirme que o download terminou e tente novamente.',
} as const

export function isArchivePasswordRequiredError(message: string): boolean {
  const msg = message.trim()
  if (!msg) return false
  if (msg.includes('archive_password_required')) return true
  return /wrong password|enter password|password required|cannot open encrypted|data error in encrypted/i.test(
    msg,
  )
}

export function formatPasswordExtractionError(
  _message: string,
  ...hintParts: Array<string | null | undefined>
): { text: string; hint: SourcePasswordHint | null } {
  const hint = resolveSourcePasswordHint(...hintParts)
  return { text: EXTRACTION_ERROR_MESSAGES.passwordRequired, hint }
}

export function formatExtractionError(message: string): string | null {
  const msg = message.trim()
  if (!msg) return null
  if (msg.includes('extraction_busy')) return EXTRACTION_ERROR_MESSAGES.busy
  if (msg.includes('no_archive_found')) return EXTRACTION_ERROR_MESSAGES.noArchive
  if (isArchivePasswordRequiredError(msg)) {
    return formatPasswordExtractionError(msg).text
  }
  if (/cannot open the file as archive|can't open as archive/i.test(msg)) {
    return EXTRACTION_ERROR_MESSAGES.cannotOpen
  }
  if (/unsupported method/i.test(msg)) {
    return EXTRACTION_ERROR_MESSAGES.unsupportedMethod
  }
  if (msg.includes('7z_extract_failed')) return EXTRACTION_ERROR_MESSAGES.generic
  if (msg.includes('download_failover')) {
    return 'A tentar outra fonte do catálogo automaticamente…'
  }
  if (msg.includes('download_stalled_recovering') || msg.includes('download_stalled')) {
    return 'Sem atividade — a retomar automaticamente…'
  }
  if (msg.includes('already registered') || /infohash\s+[a-f0-9]+\s+is already registered/i.test(msg)) {
    return 'Este torrent já está na fila ou a ser transferido. Abra Downloads ou cancele o job anterior e tente de novo.'
  }
  if (msg.includes('download_payload_too_small') || msg.includes('verify_too_small')) {
    return 'Ainda só há metadados do torrent — a iniciar o download do jogo…'
  }
  if (msg.includes('verify_failed') || msg.includes('verify_no_file')) {
    return 'O download parece incompleto ou corrompido. Retome ou baixe de novo.'
  }
  return null
}
