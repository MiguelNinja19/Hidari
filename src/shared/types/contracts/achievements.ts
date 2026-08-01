/**
 * Tipos para Achievements.
 * Espelham os structs Rust em src-tauri/src/achievements/mod.rs.
 */

export interface UnlockedAchievement {
  name: string
  unlock_time: number
  hardcore_unlock_time?: number
}

export interface Achievement {
  id: string
  display_name: string
  description: string
  icon_url?: string | null
  icongray_url?: string | null
  hidden: boolean
  points: number
  is_platinum?: boolean
}

export interface AchievementData {
  achievements: Achievement[]
  unlocked: UnlockedAchievement[]
  source?: string | null
}

export interface ScanAchievementsResult {
  object_id: string
  shop: string
  unlocked: UnlockedAchievement[]
  source?: string | null
  scanned_paths: string[]
}

export type Cracker =
  | 'Codex'
  | 'Goldberg'
  | 'Rune'
  | 'OnlineFix'
  | 'Skidrow'
  | 'Rld'
  | 'Empress'
  | 'ThreeDM'
  | 'Flt'
  | 'Razor1911'
  | 'CreamApi'
  | 'SmartSteamEmu'
  | 'Steam'
