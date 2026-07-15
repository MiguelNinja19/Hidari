/** Helpers de géneros (Steam / catálogo) usados no Discover. */

export function parseGenreList(genre: string | undefined | null): string[] {
  const raw = genre?.trim() ?? ''
  if (!raw) return []
  return raw
    .split(/[,/;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}
