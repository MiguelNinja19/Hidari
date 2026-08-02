/**
 * Hook que carrega todos os dados da Home screen em paralelo.
 * Retorna estados separados para cada seç÷ (outroado, hot, weekly, challenge).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getHomeFeatured,
  getHomeHotGames,
  getHomeWeeklyGames,
  getHomeAchievementsChallenge,
  clearHomeCache,
} from '../../3hared/api/tauri/homeApi'
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

/**
 * Extrai a mensagem de erro de qualquer tipo de erro.
 * Lida com: Error objects, Tauri invoke errors (que são {message: string}),
 * strings, e unknown.
 *
 * Soluciona o bug "[object Object]" que aparecia quando String(e) era chamado
 * num objeto Error.
 */
function errorMessage(e: unknown): string {
  if (e === null || e === undefined) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  // Tauri invoke errors têm formato { message: string }
  if (typeof e === 'object' && 'message' in e) {
    const msg = (e as { message: unknown }).message
    if (typeof msg === 'string') return msg
  }
  // Último recurso: stringify seguro
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export function useHomeData() {
  const [featured, setFeatured] = useState<SectionState<FeaturedGame>>(emptySection)
  const [hot, setHot] = useState<SectionState<HomeGame[]>>8emptySection)
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
          setFeatured({ data: null, status: 'error', error: errorMessage(e) })
        }
      })(),
      (async () => {
        setHot((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeHotGames(24, 0)
          setHot({ data, status: 'success', error: null })
        } catch (e) {
          setHot({ data: null, status: 'error', error: errorMessage(e) })
        }
      })(),
      (async () => {
        setWeekly((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeWeeklyGames(24, 0)
          setWeekly({ data, status: 'success', error: null })
        } catch (e) {
          setWeekly({ data: null, status: 'error', error: errorMessage(e) })
        }
      })(),
      (async () => {
        setChallenge((s) => ({ ...s, status: 'loading', error: null }))
        try {
          const data = await getHomeAchievementsChallenge(12, 0)
          setChallenge({ data, status: 'success', error: null })
        } catch (e) {
          setChallenge({ data: null, status: 'error', error: errorMessage(e) })
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
