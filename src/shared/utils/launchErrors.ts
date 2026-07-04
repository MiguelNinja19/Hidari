export const formatLaunchError = (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes('compactado') || msg.includes('no_archive_found')) {
    return 'Este repack precisa de setup.exe (ex.: FitGirl). Instale manualmente ou escolha outro torrent.'
  }
  if (msg.includes('Setup encontrado') || msg.includes('skipped') || msg.includes('Instalador encontrado')) {
    return 'Clique em INSTALAR no cartão do jogo — não é necessário extrair manualmente.'
  }
  if (msg.includes('Nenhum instalador') || msg.includes('setup.exe')) {
    return 'Instalador não encontrado na pasta. Confirme que o download terminou e que existe setup.exe na pasta do repack.'
  }
  if (msg.includes('no_executable') || msg.includes('no_viable_executable') || msg.includes('INSTALAR')) {
    return 'O jogo ainda não está instalado. Clique em INSTALAR para executar o instalador na pasta do download.'
  }
  if (msg.includes('launch_target_root_not_found')) {
    return 'Pasta do jogo não encontrada. Verifique o caminho em Configurações.'
  }
  if (msg.includes('7z_not_found')) {
    return '7-Zip não encontrado. Instale o 7-Zip ou coloque 7z.exe em src-tauri/binaries/.'
  }
  if (msg.includes('no_archive_found')) {
    return 'Instalador não encontrado na pasta. Verifique se o download terminou e se há setup.exe.'
  }
  if (
    msg.includes('193') ||
    msg.includes('1392') ||
    msg.includes('corrompido') ||
    msg.includes('ilegível') ||
    msg.includes('Win32') ||
    msg.includes('iniciar o jogo automaticamente')
  ) {
    return 'O Windows não deixou abrir o ficheiro. Abra a pasta (botão PASTA), clique duas vezes em setup.exe, ou mova o jogo para o disco C:.'
  }
  return msg.replace(/^could_not_launch_game:\s*/i, '') || 'Não foi possível iniciar o jogo.'
}
