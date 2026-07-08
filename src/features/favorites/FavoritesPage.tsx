import { useEffect, useMemo } from 'react'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import type { CatalogGame, FavoriteEntry } from '../../shared/types/contracts'
import { catalogGameGroupKey } from '../../shared/utils/normalizeTitleKey'
import { isLikelyGameGenre } from '../../shared/utils/formatGenreLine'
import { useGenreOverrides } from '../genres/useGenreOverrides'
import type { ResolvedCover } from '../covers/useGameCovers'
import { FavoriteGameCard, FavoriteGameCardSkeleton } from './FavoriteGameCard'

type FavoritesPageProps = {
  favorites: FavoriteEntry[]
  catalogGames: CatalogGame[]
  loading: boolean
  onOpenFavorite: (entry: FavoriteEntry) => void
  warmCover: (title: string, coverUrl: string) => void
  resolveCoversBatch: (titles: string[]) => void
  resolveCover: (
    title: string,
    catalogCoverUrl?: string | null,
    catalogLocalPath?: string | null,
  ) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
}

function resolveFavoriteGenre(entry: FavoriteEntry, catalogByKey: Map<string, CatalogGame>): string {
  const fromKey = catalogByKey.get(entry.catalogKey)
  const candidates = [
    fromKey?.genre?.trim(),
    ...Array.from(catalogByKey.values())
      .filter((game) => game.title === entry.title)
      .map((game) => game.genre?.trim())
      .filter(Boolean),
  ]

  for (const value of candidates) {
    if (value && isLikelyGameGenre(value)) return value
  }

  return ''
}

function favoriteBadge(entry: FavoriteEntry): string {
  const added = Date.parse(entry.addedAt)
  if (!Number.isNaN(added)) {
    const days = (Date.now() - added) / (1000 * 60 * 60 * 24)
    if (days <= 7) return 'Novo'
  }
  return 'Favorito'
}

export function FavoritesPage({
  favorites,
  catalogGames,
  loading,
  onOpenFavorite,
  warmCover,
  resolveCoversBatch,
  resolveCover,
  invalidateLocalCover,
}: FavoritesPageProps) {
  const catalogByKey = useMemo(() => {
    const map = new Map<string, CatalogGame>()
    for (const game of catalogGames) {
      map.set(catalogGameGroupKey(game.title), game)
    }
    return map
  }, [catalogGames])

  const favoriteTitles = useMemo(() => favorites.map((entry) => entry.title), [favorites])
  const { pickGenre } = useGenreOverrides(favoriteTitles, !loading && favorites.length > 0)

  useEffect(() => {
    if (loading || favorites.length === 0) return
    const missing = favorites
      .filter((entry) => {
        const catalog = catalogByKey.get(entry.catalogKey)
        const cover = resolveCover(entry.title, catalog?.coverUrl, catalog?.localCoverPath)
        return !cover.coverUrl?.trim() && !cover.localPath?.trim()
      })
      .map((entry) => entry.title)
      .slice(0, 24)
    if (missing.length > 0) {
      resolveCoversBatch(missing)
    }
  }, [catalogByKey, favorites, loading, resolveCover, resolveCoversBatch])

  return (
    <section className="favorites-page">
      {loading ? (
        <ul className="favorites-grid favorites-grid--skeleton">
          {Array.from({ length: 8 }, (_, index) => (
            <FavoriteGameCardSkeleton key={index} />
          ))}
        </ul>
      ) : null}

      {!loading && favorites.length > 0 ? (
        <ul className="favorites-grid">
          {favorites.map((entry, index) => {
            const catalog = catalogByKey.get(entry.catalogKey)
            const cover = resolveCover(entry.title, catalog?.coverUrl, catalog?.localCoverPath)
            const coverUrl = catalog?.coverUrl?.trim() || cover.coverUrl
            const localPath = catalog?.localCoverPath?.trim() || cover.localPath
            const genreLine = pickGenre(entry.title, resolveFavoriteGenre(entry, catalogByKey))

            return (
              <CoverWarmGridItem
                key={entry.catalogKey}
                title={entry.title}
                coverUrl={coverUrl}
                warmCover={warmCover}
                onNeedsCover={(title) => resolveCoversBatch([title])}
                className="favorites-grid__item"
              >
                <FavoriteGameCard
                  title={entry.title}
                  genreLine={genreLine}
                  badge={favoriteBadge(entry)}
                  coverUrl={coverUrl}
                  localPath={localPath}
                  coverStatus={cover.status}
                  priority={index < 8}
                  onOpen={() => onOpenFavorite(entry)}
                  onLocalCoverError={() => invalidateLocalCover(entry.title, coverUrl)}
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
