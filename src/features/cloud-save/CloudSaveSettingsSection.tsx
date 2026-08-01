/**
 * Settings section para configurar o Cloud Save backend.
 * Permite ao usuário escolher entre Local, WebDAV, ou Hydra (futuro).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getCloudSaveSettings,
  setCloudSaveSettings,
  testCloudSaveConnection,
  selectSaveFolder,
} from '../../shared/api/tauri/cloudSaveApi'
import type { BackendType, CloudSaveSettings } from '../../shared/types/contracts/cloudSave'

export function CloudSaveSettingsSection() {
  const [settings, setSettings] = useState<CloudSaveSettings | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getCloudSaveSettings().then(setSettings)
  }, [])

  const handleBackendChange = useCallback((backend: BackendType) => {
    setSettings((s) => (s ? { ...s, backend } : null))
    setSaved(false)
  }, [])

  const handleFieldChange = useCallback(
    (field: keyof CloudSaveSettings, value: string) => {
      setSettings((s) => (s ? { ...s, [field]: value } : null))
      setSaved(false)
    },
    [],
  )

  const handleBrowseLocal = useCallback(async () => {
    const path = await selectSaveFolder()
    if (path) {
      handleFieldChange('local_folder', path)
    }
  }, [handleFieldChange])

  const handleSave = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      await setCloudSaveSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setTestError(String(e))
    } finally {
      setSaving(false)
    }
  }, [settings])

  const handleTest = useCallback(async () => {
    if (!settings) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      // Save first, then test
      await setCloudSaveSettings(settings)
      const result = await testCloudSaveConnection()
      setTestResult(result)
    } catch (e) {
      setTestError(String(e))
    } finally {
      setTesting(false)
    }
  }, [settings])

  if (!settings) {
    return <div className="cloud-save-settings">Carregando...</div>
  }

  return (
    <section className="cloud-save-settings">
      <h3 className="cloud-save-settings__title">☁️ Cloud Save</h3>
      <p className="cloud-save-settings__desc">
        Escolha onde seus saves de jogos serão sincronizados na nuvem. Recomendado: WebDAV para uso
        independente, ou Local se você já tem Dropbox/OneDrive montado.
      </p>

      <div className="cloud-save-settings__backend-grid">
        <label className={`cloud-save-settings__backend-card${settings.backend === 'Local' ? ' cloud-save-settings__backend-card--active' : ''}`}>
          <input
            type="radio"
            name="cloud-save-backend"
            checked={settings.backend === 'Local'}
            onChange={() => handleBackendChange('Local')}
          />
          <div className="cloud-save-settings__backend-card-content">
            <div className="cloud-save-settings__backend-name">📁 Pasta Local</div>
            <div className="cloud-save-settings__backend-desc">
              Salva em pasta local (útil se você tem Dropbox/OneDrive/iCloud Drive montado)
            </div>
          </div>
        </label>

        <label className={`cloud-save-settings__backend-card${settings.backend === 'Webdav' ? ' cloud-save-settings__backend-card--active' : ''}`}>
          <input
            type="radio"
            name="cloud-save-backend"
            checked={settings.backend === 'Webdav'}
            onChange={() => handleBackendChange('Webdav')}
          />
          <div className="cloud-save-settings__backend-card-content">
            <div className="cloud-save-settings__backend-name">🌐 WebDAV</div>
            <div className="cloud-save-settings__backend-desc">
              Nextcloud, Synology NAS, pCloud, Box.com — recomendado para independência total
            </div>
          </div>
        </label>

        <label className={`cloud-save-settings__backend-card${settings.backend === 'Hydra' ? ' cloud-save-settings__backend-card--active' : ''} cloud-save-settings__backend-card--disabled`}>
          <input
            type="radio"
            name="cloud-save-backend"
            disabled
          />
          <div className="cloud-save-settings__backend-card-content">
            <div className="cloud-save-settings__backend-name">🐉 Hydra API <em>(em breve)</em></div>
            <div className="cloud-save-settings__backend-desc">
              Backend do Hydra Launcher — requer conta Hydra + subscription
            </div>
          </div>
        </label>
      </div>

      {settings.backend === 'Local' && (
        <div className="cloud-save-settings__fields">
          <label className="cloud-save-settings__field">
            <span>Pasta raiz dos backups:</span>
            <div className="cloud-save-settings__folder-row">
              <input
                type="text"
                value={settings.local_folder ?? ''}
                placeholder="/home/usuario/Dropbox/hidari-backups"
                onChange={(e) => handleFieldChange('local_folder', e.target.value)}
              />
              <button type="button" onClick={() => void handleBrowseLocal()}>Procurar</button>
            </div>
          </label>
        </div>
      )}

      {settings.backend === 'Webdav' && (
        <div className="cloud-save-settings__fields">
          <label className="cloud-save-settings__field">
            <span>URL do servidor WebDAV:</span>
            <input
              type="text"
              value={settings.webdav_url ?? ''}
              placeholder="https://cloud.exemplo.com/remote.php/dav/files/usuario"
              onChange={(e) => handleFieldChange('webdav_url', e.target.value)}
            />
          </label>
          <label className="cloud-save-settings__field">
            <span>Usuário:</span>
            <input
              type="text"
              value={settings.webdav_username ?? ''}
              onChange={(e) => handleFieldChange('webdav_username', e.target.value)}
            />
          </label>
          <label className="cloud-save-settings__field">
            <span>Senha:</span>
            <input
              type="password"
              value={settings.webdav_password ?? ''}
              onChange={(e) => handleFieldChange('webdav_password', e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="cloud-save-settings__actions">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="cloud-save-settings__btn"
          disabled={saving}
        >
          {saving ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          className="cloud-save-settings__btn cloud-save-settings__btn--primary"
          disabled={testing}
        >
          {testing ? 'Testando...' : 'Testar Conexão'}
        </button>
      </div>

      {testResult && (
        <div className="cloud-save-settings__test-result cloud-save-settings__test-result--ok">
          ✓ {testResult}
        </div>
      )}
      {testError && (
        <div className="cloud-save-settings__test-result cloud-save-settings__test-result--error">
          ❌ {testError}
        </div>
      )}
    </section>
  )
}
