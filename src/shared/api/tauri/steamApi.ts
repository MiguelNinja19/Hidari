/**
 * Cliente Tauri para os comandos de integração Steam.
 */

import { invoke } from '@tauri-apps/api/core'
import type { SteamInstall, ScanResult, ImportResult, AppManifest } from '../../types/contracts/steam'

/** Detecta instalação do Steam (path, user IDs, library folders). */
export async function detectSteamInstall(): Promise<SteamInstall | null> {
  return invoke<SteamInstall | null>('detect_steam_install_command')
}

/** Escaneia todas as library folders do Steam por jogos instalados. */
export async function scanSteamLibrary(): Promise<ScanResult | null> {
  return invoke<ScanResult | null>('scan_steam_library_command')
}

/** Importa jogos Steam selecionados para a library do Hidari. */
export async function importSteamGamesToLibrary(manifests: AppManifest[]): Promise<ImportResult> {
  return invoke<ImportResult>('import_steam_games_to_library', { manifests })
}

/** Lista de user IDs do Steam (para acesso futuro a shortcuts.vdf). */
export async function getSteamUsers(): Promise<string[]> {
  return invoke<string[]>('get_steam_users')
}
