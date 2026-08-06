/**
 * Cliente Tauri para os comandos da Home screen.
 * Cada funo invoca um #[tauri::command] no backend Rust.
 */

import { invoke } from '@tauri-apps/api/core'
import type { FeaturedGame, HomeGame, ChallengeGame } from '../../types/contracts/home'

/**
 * Busca o jogo em destaque (hero) da Home.
 * Usa cache de 30 minutos no backend.
 */
export async function getHomeFeatured(language?: string): Promise<FeaturedGame> {
  return invoke<FeaturedGame>('get_home_featured', { language: language ?? null })
}

/**
 * Busca a lista de jogos trending agora (hot).
 */
export async function getHomeHotGames(take = 24, skip = 0): Promise<HomeGame[]> {
  return invoke<HomeGame[]>('get_home_hot_games', { take, skip })
}

/**
 * Busca a lista de jogos populares da semana.
 */
export async function getHomeWeeklyGames(take = 24, skip = 0): Promise<HomeGame[]> {
  return invoke<HomeGame[]>('get_home_weekly_games', { take, skip })
}

/**
 * Busca a lista de jogos com challenge achievements (hard platinums).
 */
export async function getHomeAchievementsChallenge(take = 12, skip = 0): Promise<ChallengeGame[]> {
  return invoke<ChallengeGame[]>('get_home_achievements_challenge', { take, skip })
}

/**
 * Limpa todo o cache da Home (debug/refresh).
 */
export async function clearHomeCache(): Promise<void> {
  return invoke<void>('clear_home_cache')
}
