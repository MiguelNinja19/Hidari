export type FavoriteCatalogEntry = {
  catalogKey: string
  title: string
  addedAt: string
}

export type LibraryPlayStat = {
  pathKey: string
  lastPlayedAt: string | null
  playCount: number
}

export function libraryPlayPathKey(path: string, title: string): string {
  return `${path.toLowerCase()}::${title.toLowerCase()}`
}
