/**
 * Hook que carrega todos os dados da Home screen em paralelo.
 * Retorna estados separados para cada seção (featured, hot, weekly, challenge).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getHomeFeatured,
  getHomeHotGames,
  getHomeWeeklyGames,
  getHomeAchievementsChallenge,
  clearHomeCache,
} from '../../shared/api/tauri/homeApi'
import type { FeaturedGame, HomeGame, ChallengeGame } from '../../shared/types/contracts/home'

type LoadingState = 'idle' | 'loading' | 'success' | 'error'

interface SectionState<T> {
  data: T | null
  status: LoadingState
  error: string | null
}

function emptySection<T>(): SectionState<T> {
  return { data: null, status: 'idle', error: null }
}

export function useHomeData() {
  const [featured, setFeatured] = useState<SectionState<FeaturedGame>>(emptySection)
  const [hot, setHot] = useState<SectionState<HomeGame[]>>(emptySection)
  const [weekly, setWeekly] = useState<SectionState<HomeGame[]>>(emptySection)
  const [challenge, setChallenge] = useState<SectionState<ChallengeGame[]>>(emptySection)

  const loadAll = useCallback(async () => {
    // Carrega todas as seções em paralelo para máxima velocidade
    const promises: Array<Promise<void>> = [
      (async () => {
        setFeatured((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeFeatured('en')
          setFeatured({ data, status: 'success', error: null })
        } catch (e) {
          setFeatured({ data: null, status: 'error', error: String(e) })
        }
      })(),
      (async () => {
        setHot((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeHotGames(24, 0)
          setHot({ data, status: 'success', error: null })
        } catch (e) {
          setHot({ data: null, status: 'error', error: String(e) })
        }
      })(),
      (async () => {
        setWeekly((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeWeeklyGames(24, 0)
          setWeekly({ data, status: 'success', error: null })
        } catch (e) {
          setWeekly({ data: null, status: 'error', error: String(e) })
        }
      })(),
      (async () => {
        setChallenge((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeAchievementsChallenge(12, 0)
          setChallenge({ data, status: 'success', error: null })
        } catch (e) {
          setChallenge({ data: null, status: 'error', error: String(e) })
        }
      })(),
    ]
    await Promise.allSettled(promises)
  }, [])

  const refresh = useCallback(async () => {
    await clearHomeCache()
    await loadAll()
  }, [loadAll])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return {
    featured,
    hot,
    weekly,
    challenge,
    refresh,
    isLoading:
      featured.status === 'loading' ||
      hot.status === 'loading' ||
      weekly.status === 'loading' ||
      challenge.status === 'loading',
  }
}
