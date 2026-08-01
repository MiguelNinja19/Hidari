/**
 * Tipos compartilhados para a Home screen.
 * Espelham os structs Rust em src-tauri/src/home/mod.rs.
 */

export interface HomeGame {
  object_id: string
  shop: string
  title: string
  icon_url?: string | null
  cover_image_url?: string | null
  library_hero_image_url?: string | null
  library_image_url?: string | null
  logo_image_url?: string | null
  logo_position?: string | null
  download_sources: string[]
}

export interface FeaturedGame extends HomeGame {
  description?: string | null
  uri?: string | null
}

export interface ChallengeGame extends HomeGame {
  genres: string[]
}

export interface HomeError {
  message: string
}
