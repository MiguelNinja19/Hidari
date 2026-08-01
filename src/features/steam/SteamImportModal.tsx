/**
 * Modal de importação de jogos Steam para a library do Hidari.
 * Fluxo: detectar Steam → escanear biblioteca → mostrar lista → importar selecionados.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  detectSteamInstall,
  scanSteamLibrary,
  importSteamGamesToLibrary,
} from '../../shared/api/tauri/steamApi'
import type { AppManifest, ImportResult, SteamInstall } from '../../shared/types/contracts/steam'

type ModalState = 'idle' | 'detecting' | 'scanning' | 'ready' | 'importing' | 'done' | 'error'

type SteamImportModalProps = {
  open: boolean
  onClose: () => void
  onImported?: (result: ImportResult) => void
}

export function SteamImportModal({ open, onClose, onImported }: SteamImportModalProps) {
  const [state, setState] = useState<ModalState>('idle')
  const [install, setInstall] = useState<SteamInstall | null>(null)
  const [manifests, setManifests] = useState<AppManifest[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setInstall(null)
    setManifests([])
    setSelected(new Set())
    setResult(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
    }
  }, [open, reset])

  const handleDetect = useCallback(async () => {
    setState('detecting')
    setError(null)
    try {
      const detected = await detectSteamInstall()
      if (!detected) {
        setError('Steam não encontrado. Instale o Steam ou defina a variável STEAM_PATH.')
        setState('error')
        return
      }
      setInstall(detected)
      setState('scanning')
      const scan = await scanSteamLibrary()
      if (!scan) {
        setError('Falha ao escanear biblioteca Steam.')
        setState('error')
        return
      }
      setManifests(scan.manifests)
      // Seleciona todos por padrão
      setSelected(new Set(scan.manifests.map((m) => m.appid)))
      setState('ready')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [])

  const handleToggle = useCallback((appid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(appid)) {
        next.delete(appid)
      } else {
        next.add(appid)
      }
      return next
    })
  }, [])

  const handleImport = useCallback(async () => {
    setState('importing')
    setError(null)
    try {
      const toImport = manifests.filter((m) => selected.has(m.appid))
      const res = await importSteamGamesToLibrary(toImport)
      setResult(res)
      setState('done')
      onImported?.(res)
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [manifests, selected, onImported])

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(manifests.map((m) => m.appid)))
  }, [manifests])

  const handleSelectNone = useCallback(() => {
    setSelected(new Set())
  }, [])

  if (!open) return null

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—'
    const gb = bytes / 1_073_741_824
    if (gb < 1) return `${(bytes / 1_048_576).toFixed(0)} MB`
    return `${gb.toFixed(1)} GB`
  }

  return (
    <div className="steam-modal-overlay" onClick={onClose}>
      <div className="steam-modal" onClick={(e) => e.stopPropagation()}>
        <header className="steam-modal__header">
          <h2>Importar jogos do Steam</h2>
          <button type="button" className="steam-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="steam-modal__body">
          {state === 'idle' && (
            <div className="steam-modal__intro">
              <p>
                Detecta jogos instalados via Steam e os importa para a biblioteca do Hidari. O Steam precisa estar
                instalado (mas não precisa estar aberto).
              </p>
              <button type="button" className="steam-modal__btn steam-modal__btn--primary" onClick={handleDetect}>
                Detectar e Escanear
              </button>
            </div>
          )}

          {(state === 'detecting' || state === 'scanning') && (
            <div className="steam-modal__loading">
              <div className="steam-modal__spinner" />
              <p>{state === 'detecting' ? 'Detectando Steam...' : 'Escaneando biblioteca Steam...'}</p>
            </div>
          )}

          {state === 'ready' && install && (
            <div className="steam-modal__ready">
              <div className="steam-modal__info">
                <p>
                  <strong>Steam path:</strong> {install.path}
                </p>
                <p>
                  <strong>Library folders:</strong> {install.library_folders.length}
                </p>
                <p>
                  <strong>Jogos encontrados:</strong> {manifests.length}
                </p>
              </div>

              <div className="steam-modal__actions-bar">
                <button type="button" onClick={handleSelectAll} className="steam-modal__btn steam-modal__btn--small">
                  Selecionar todos
                </button>
                <button type="button" onClick={handleSelectNone} className="steam-modal__btn steam-modal__btn--small">
                  Limpar seleção
                </button>
                <span className="steam-modal__count">
                  {selected.size} selecionado{selected.size === 1 ? '' : 's'}
                </span>
              </div>

              <div className="steam-modal__games-list">
                {manifests.map((m) => (
                  <label key={m.appid} className="steam-game-row">
                    <input
                      type="checkbox"
                      checked={selected.has(m.appid)}
                      onChange={() => handleToggle(m.appid)}
                    />
                    <div className="steam-game-row__info">
                      <div className="steam-game-row__name">{m.name}</div>
                      <div className="steam-game-row__meta">
                        appid: {m.appid} · {formatSize(m.size_on_disk)}
                      </div>
                    </div>
                  </label>
                ))}
                {manifests.length === 0 && (
                  <p className="steam-modal__empty">Nenhum jogo Steam instalado encontrado.</p>
                )}
              </div>

              <div className="steam-modal__footer">
                <button type="button" onClick={onClose} className="steam-modal__btn">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="steam-modal__btn steam-modal__btn--primary"
                  disabled={selected.size === 0}
                >
                  Importar {selected.size} jogo{selected.size === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {state === 'importing' && (
            <div className="steam-modal__loading">
              <div className="steam-modal__spinner" />
              <p>Importando {selected.size} jogos...</p>
            </div>
          )}

          {state === 'done' && result && (
            <div className="steam-modal__done">
              <div className="steam-modal__done-icon">✓</div>
              <h3>Importação concluída</h3>
              <p>
                <strong>{result.imported_count}</strong> jogo(s) importado(s) com sucesso.
              </p>
              {result.skipped_count > 0 && (
                <p>
                  <strong>{result.skipped_count}</strong> jogo(s) ignorado(s) pois já estavam na biblioteca.
                </p>
              )}
              {result.errors.length > 0 && (
                <details className="steam-modal__errors">
                  <summary>{result.errors.length} erro(s)</summary>
                  <ul>
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
              <button type="button" className="steam-modal__btn steam-modal__btn--primary" onClick={onClose}>
                Concluir
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="steam-modal__error">
              <p>❌ {error}</p>
              <button type="button" className="steam-modal__btn" onClick={onClose}>
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
