/**
 * Cliente Tauri para Achievements commands.
 */

import { invoke } from '@tauri-apps/api/core'
import type { ScanAchievementsResult } from '../../types/contracts/achievements'

/** Escaneia arquivos de save crackers buscando achievements desbloqueados. */
export async function scanGameAchievements(
  shop: string,
  objectId: string,
  steamPath?: string,
  winePrefix?: string,
): Promise<ScanAchievementsResult> {
  return invoke<ScanAchievementsResult>('scan_game_achievements', {
    shop,
    objectId,
    steamPath: steamPath ?? null,
    winePrefix: winePrefix ?? null,
  })
}

/** Pega achievements cacheados, ou escaneia se ainda não tiver. */
export async function getUnlockedAchievements(
  shop: string,
  objectId: string,
  steamPath?: string,
  winePrefix?: string,
): Promise<ScanAchievementsResult> {
  return invoke<ScanAchievementsResult>('get_unlocked_achievements', {
    shop,
    objectId,
    steamPath: steamPath ?? null,
    winePrefix: winePrefix ?? null,
  })
}

/** Limpa o cache em memória dos achievements. */
export async function clearAchievementsCache(): Promise<void> {
  return invoke<void>('clear_achievements_cache')
}
