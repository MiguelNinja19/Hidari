import { catalogGameGroupKey } from './normalizeTitleKey'
import type { CatalogGame } from '../types/contracts'

/** Chaves antigas gravavam `game.id` (`source:emb_…`) em vez do groupKey real. */
export function isUsableFavoriteCatalogKey(key: string | null | undefined): boolean {
  const value = key?.trim() ?? ''
  if (!value) return false
  const lower = value.toLowerCase()
  if (lower.startsWith('source:')) return false
  if (lower.startsWith('emb_') && !lower.includes(' ')) return false
  return true
}

/** Chave estável para guardar/consultar favoritos. */
export function favoriteCatalogKeyForGame(
  game: Pick<CatalogGame, 'title' | 'groupKey' | 'id'>,
): string {
  const group = game.groupKey?.trim()
  if (isUsableFavoriteCatalogKey(group)) return group!
  const fromTitle = catalogGameGroupKey(game.title)
  if (fromTitle) return fromTitle
  const id = game.id?.trim()
  if (isUsableFavoriteCatalogKey(id)) return id!
  return game.title.trim()
}

export function favoriteCatalogKeyForEntry(title: string, catalogKey?: string | null): string {
  if (isUsableFavoriteCatalogKey(catalogKey)) return catalogKey!.trim()
  const fromTitle = catalogGameGroupKey(title)
  return fromTitle || title.trim()
}
