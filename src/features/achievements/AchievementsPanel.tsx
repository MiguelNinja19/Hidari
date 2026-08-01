/**
 * Painel de Achievements para mostrar conquistas desbloqueadas de um jogo.
 *
 * Exibe:
 * - Contador (X conquistas desbloqueadas)
 * - Source (qual cracker foi detectado)
 * - Lista de achievements com nome e data de unlock
 *
 * Pensado para ser embutido na Library detail view (sidebar direita).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getUnlockedAchievements,
  scanGameAchievements,
} from '../../shared/api/tauri/achievementsApi'
import type { ScanAchievementsResult } from '../../shared/types/contracts/achievements'

type AchievementsPanelProps = {
  shop: string
  objectId: string
  steamPath?: string | null
  winePrefix?: string | null
}

type PanelState = 'idle' | 'loading' | 'success' | 'error'

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString()
}

export function AchievementsPanel({ shop, objectId, steamPath, winePrefix }: AchievementsPanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [result, setResult] = useState<ScanAchievementsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const res = await getUnlockedAchievements(
        shop,
        objectId,
        steamPath ?? undefined,
        winePrefix ?? undefined,
      )
      setResult(res)
      setState('success')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [shop, objectId, steamPath, winePrefix])

  const refresh = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const res = await scanGameAchievements(
        shop,
        objectId,
        steamPath ?? undefined,
        winePrefix ?? undefined,
      )
      setResult(res)
      setState('success')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [shop, objectId, steamPath, winePrefix])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="achievements-panel">
      <header className="achievements-panel__header">
        <h3 className="achievements-panel__title">🏆 Conquistas</h3>
        <button
          type="button"
          className="achievements-panel__refresh"
          onClick={() => void refresh()}
          disabled={state === 'loading'}
          title="Re-escanear"
        >
          ↻
        </button>
      </header>

      {state === 'loading' && (
        <div className="achievements-panel__loading">
          <div className="achievements-panel__spinner" />
          <span>Escaneando...</span>
        </div>
      )}

      {state === 'error' && (
        <div className="achievements-panel__error">
          <p>❌ {error}</p>
        </div>
      )}

      {state === 'success' && result && (
        <>
          <div className="achievements-panel__summary">
            <span className="achievements-panel__count">
              {result.unlocked.length} conquista{result.unlocked.length === 1 ? '' : 's'}
            </span>
            {result.source ? (
              <span className="achievements-panel__source">via {result.source}</span>
            ) : (
              <span className="achievements-panel__source achievements-panel__source--none">
                sem saves detectados
              </span>
            )}
          </div>

          {result.unlocked.length > 0 ? (
            <ul className="achievements-panel__list">
              {result.unlocked.map((a) => (
                <li key={a.name} className="achievements-panel__item">
                  <span className="achievements-panel__item-name">{a.name}</span>
                  <span className="achievements-panel__item-date">{formatDate(a.unlock_time)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="achievements-panel__empty">
              Nenhuma conquista desbloqueada encontrada.
              <br />
              <span className="achievements-panel__hint">
                Jogue o jogo pelo menos uma vez para que o cracker registre o arquivo de achievements.
              </span>
            </p>
          )}

          <details className="achievements-panel__debug">
            <summary onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'Ocultar' : 'Mostrar'} paths escaneados ({result.scanned_paths.length})
            </summary>
            <ul className="achievements-panel__paths">
              {result.scanned_paths.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
