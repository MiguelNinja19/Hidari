import { cleanTitleForCover } from './normalizeTitleKey'

/** Tokens para matching de pastas/executáveis (paridade com Rust `title::tokenize_title`). */
export function tokenizeTitleForMatching(title: string): string[] {
  return cleanTitleForCover(title)
    .split(/[^a-zA-Z0-9]+/)
    .filter((token) => token.length >= 3)
    .map((token) => token.toLowerCase())
}

/** Query simplificada para pesquisa Hydra (paridade com Rust `title::simplify_source_search_query`). */
export function simplifySourceSearchQuery(title: string): string {
  const cleaned = title.replace(/[™®©]/g, '').trim()
  const head = cleaned.split(':')[0]?.split(' - ')[0]?.trim()
  return head || cleaned
}
