import { formatExtractionError } from './downloadErrorCodes'

/** Códigos estáveis devolvidos pelo backend como `launch_error:<code>|...` */
export const LAUNCH_ERROR_MESSAGES: Record<string, string> = {
  path_not_found:
    'Pasta do jogo não encontrada. Confirme o caminho de download em Configurações.',
  needs_install:
    'O jogo ainda não está instalado. Clique em INSTALAR para executar o instalador na pasta do download.',
  repack_needs_setup:
    'Este repack precisa de setup.exe (ex.: FitGirl). Instale manualmente ou escolha outro torrent.',
  no_executable:
    'Nenhum executável de jogo encontrado na pasta. Instale o jogo com o setup.exe primeiro.',
  win32_blocked:
    'Não foi possível iniciar o jogo automaticamente. Abra a pasta, execute o setup se existir, ou inicie o .exe principal manualmente.',
  file_corrupt:
    'O Windows bloqueou o arquivo. Abra a pasta do jogo, execute setup.exe manualmente ou mova o jogo para outro disco (ex.: C:).',
  no_valid_executable: 'Nenhum executável válido encontrado na pasta do jogo.',
  archive_not_found:
    'Instalador não encontrado na pasta. Verifique se o download terminou e se há setup.exe.',
  seven_zip_missing:
    '7-Zip não encontrado. Instale o 7-Zip ou coloque 7z.exe em src-tauri/binaries/.',
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
    return 'Clique em INSTALAR no cartão do jogo — não é necessário extrair manualmente.'
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
  return msg.replace(/^could_not_launch_game:\s*/i, '') || 'Não foi possível iniciar o jogo.'
}
