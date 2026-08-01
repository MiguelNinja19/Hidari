/**
 * Painel de Cloud Save — gerencia backups de save na nuvem.
 *
 * Permite:
 * - Selecionar pasta de save do jogo
 * - Criar backup (upload)
 * - Listar backups salvos
 * - Restaurar backup (download + extract)
 * - Deletar backup
 * - Alternar frozen (proteção contra auto-prune)
 *
 * Embutido na Library detail view, abaixo do AchievementsPanel.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  listCloudSaveArtifacts,
  uploadCloudSave,
  restoreCloudSave,
  deleteCloudSave,
  setCloudSaveFrozen,
  selectSaveFolder,
} from '../../shared/api/tauri/cloudSaveApi'
import type { ArtifactMetadata } from '../../shared/types/contracts/cloudSave'

type CloudSavePanelProps = {
  shop: string
  objectId: string
}

type PanelState = 'idle' | 'loading' | 'ready' | 'error'

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const mb = bytes / 1_048_576
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`
  const gb = mb / 1024
  if (gb < 1) return `${mb.toFixed(1)} MB`
  return `${gb.toFixed(2)} GB`
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

export function CloudSavePanel({ shop, objectId }: CloudSavePanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saveFolderPath, setSaveFolderPath] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const list = await listCloudSaveArtifacts(shop, objectId)
      setArtifacts(list)
      setState('ready')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [shop, objectId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectFolder = useCallback(async () => {
    try {
      const path = await selectSaveFolder()
      if (path) {
        setSaveFolderPath(path)
      }
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (!saveFolderPath) {
      setError('Selecione a pasta de save primeiro.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const finalLabel = label.trim() || `Backup ${new Date().toLocaleString()}`
      await uploadCloudSave(shop, objectId, saveFolderPath, finalLabel)
      setLabel('')
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [saveFolderPath, label, shop, objectId, load])

  const handleRestore = useCallback(
    async (artifactId: string) => {
      if (!saveFolderPath) {
        setError('Selecione a pasta de save de destino primeiro.')
        return
      }
      if (!confirm('Restaurar este backup? A pasta de save atual será preservada como .before-restore.')) {
        return
      }
      setBusy(true)
      setError(null)
      try {
        await restoreCloudSave(artifactId, shop, objectId, saveFolderPath)
        await load()
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [saveFolderPath, shop, objectId, load],
  )

  const handleDelete = useCallback(
    async (artifactId: string) => {
      if (!confirm('Deletar este backup? Não pode ser desfeito.')) return
      setBusy(true)
      setError(null)
      try {
        await deleteCloudSave(artifactId, shop, objectId)
        await load()
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [shop, objectId, load],
  )

  const handleToggleFreeze = useCallback(
    async (artifactId: string, current: boolean) => {
      setBusy(true)
      setError(null)
      try {
        await setCloudSaveFrozen(artifactId, !current)
        await load()
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  return (
    <section className="cloud-save-panel">
      <header className="cloud-save-panel__header">
        <h3 className="cloud-save-panel__title">☁️ Cloud Save</h3>
        <button
          type="button"
          className="cloud-save-panel__refresh"
          onClick={() => void load()}
          disabled={state === 'loading' || busy}
          title="Atualizar"
        >
          ↻
        </button>
      </header>

      {error && <div className="cloud-save-panel__error">❌ {error}</div>}

      <div className="cloud-save-panel__save-folder">
        <label className="cloud-save-panel__label">Pasta de save:</label>
        <div className="cloud-save-panel__folder-row">
          <span className="cloud-save-panel__folder-path">
            {saveFolderPath ?? '(não selecionada)'}
          </span>
          <button
            type="button"
            onClick={() => void handleSelectFolder()}
            className="cloud-save-panel__btn cloud-save-panel__btn--small"
          >
            Selecionar
          </button>
        </div>
      </div>

      <div className="cloud-save-panel__upload-row">
        <input
          type="text"
          className="cloud-save-panel__label-input"
          placeholder="Label (opcional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void handleUpload()}
          className="cloud-save-panel__btn cloud-save-panel__btn--primary"
          disabled={busy || !saveFolderPath}
        >
          {busy ? 'Enviando...' : 'Criar Backup'}
        </button>
      </div>

      {state === 'loading' && artifacts.length === 0 ? (
        <div className="cloud-save-panel__loading">Carregando backups...</div>
      ) : artifacts.length === 0 ? (
        <p className="cloud-save-panel__empty">Nenhum backup salvo ainda.</p>
      ) : (
        <ul className="cloud-save-panel__list">
          {artifacts.map((a) => (
            <li key={a.id} className="cloud-save-artifact">
              <div className="cloud-save-artifact__info">
                <div className="cloud-save-artifact__label">
                  {a.is_frozen ? '❄️ ' : ''}
                  {a.label}
                </div>
                <div className="cloud-save-artifact__meta">
                  {formatDate(a.created_at)} · {formatSize(a.size_bytes)} · {a.hostname}
                </div>
              </div>
              <div className="cloud-save-artifact__actions">
                <button
                  type="button"
                  onClick={() => void handleRestore(a.id)}
                  disabled={busy}
                  className="cloud-save-panel__btn cloud-save-panel__btn--small"
                  title="Restaurar (substitui pasta atual)"
                >
                  ↓ Restaurar
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleFreeze(a.id, a.is_frozen)}
                  disabled={busy}
                  className="cloud-save-panel__btn cloud-save-panel__btn--small"
                  title={a.is_frozen ? 'Descongelar' : 'Congelar (proteger)'}
                >
                  {a.is_frozen ? '🔥' : '❄️'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(a.id)}
                  disabled={busy || a.is_frozen}
                  className="cloud-save-panel__btn cloud-save-panel__btn--small cloud-save-panel__btn--danger"
                  title={a.is_frozen ? 'Descongele antes de deletar' : 'Deletar'}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
