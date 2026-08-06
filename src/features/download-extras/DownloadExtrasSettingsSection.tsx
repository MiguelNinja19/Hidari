/**
 * Settings section para configurar Debrid services.
 * Permite ao usurio salvar API tokens para Real-Debrid, AllDebrid, etc.
 * Quando um download contm magnet/URL de hoster, o Hidari usar o debrid configurado.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getDebridCredentials,
  setDebridCredentials,
} from '../../shared/api/tauri/downloadExtrasApi'
import type { DebridCredentials } from '../../shared/types/contracts/downloadExtras'

export function DownloadExtrasSettingsSection() {
  const [creds, setCreds] = useState<DebridCredentials | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getDebridCredentials().then(setCreds)
  }, [])

  const handleFieldChange = useCallback(
    (field: keyof DebridCredentials, value: string) => {
      setCreds((s) => (s ? { ...s, [field]: value || null } : null))
      setSaved(false)
    },
    [],
  )

  const handleSave = useCallback(async () => {
    if (!creds) return
    setSaving(true)
    try {
      await setDebridCredentials(creds)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('save debrid creds failed:', e)
    } finally {
      setSaving(false)
    }
  }, [creds])

  if (!creds) {
    return <div className="download-extras-settings">Carregando...</div>
  }

  return (
    <section className="download-extras-settings">
      <h3 className="download-extras-settings__title"> Servios de Download</h3>
      <p className="download-extras-settings__desc">
        Configure tokens para servios de debrid (download direto sem torrent). Real-Debrid  o
        mais popular. Hoster scrapers (Mediafire, PixelDrain) funcionam automaticamente sem
        configurao.
      </p>

      <div className="download-extras-settings__grid">
        <label className="download-extras-settings__field">
          <span className="download-extras-settings__field-label">
            Real-Debrid API Token
            <a
              href="https://real-debrid.com/apitoken"
              target="_blank"
              rel="noopener noreferrer"
              className="download-extras-settings__link"
            >
              (pegar token)
            </a>
          </span>
          <input
            type="password"
            value={creds.real_debrid_token ?? ''}
            placeholder="Cole seu token aqui"
            onChange={(e) => handleFieldChange('real_debrid_token', e.target.value)}
          />
        </label>

        <label className="download-extras-settings__field">
          <span className="download-extras-settings__field-label">
            AllDebrid API Token
            <a
              href="https://alldebrid.com/apikeys/"
              target="_blank"
              rel="noopener noreferrer"
              className="download-extras-settings__link"
            >
              (pegar token)
            </a>
          </span>
          <input
            type="password"
            value={creds.all_debrid_token ?? ''}
            placeholder="Cole seu token aqui"
            onChange={(e) => handleFieldChange('all_debrid_token', e.target.value)}
          />
        </label>

        <label className="download-extras-settings__field">
          <span className="download-extras-settings__field-label">
            TorBox API Token
            <a
              href="https://torbox.app/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="download-extras-settings__link"
            >
              (pegar token)
            </a>
          </span>
          <input
            type="password"
            value={creds.torbox_token ?? ''}
            placeholder="Em breva (no implementado ainda)"
            disabled
          />
        </label>

        <label className="download-extras-settings__field">
          <span className="download-extras-settings__field-label">
            Premiumize API Token
            <a
              href="https://premiumize.me/account"
              target="_blank"
              rel="noopener noreferrer"
              className="download-extras-settings__link"
            >
              (pegar token)
            </a>
          </span>
          <input
            type="password"
            value={creds.premiumize_token ?? ''}
            placeholder="Em breva (no implementado ainda)"
            disabled
         />
        </label>

        <label className="download-extras-settings__field">
          <span className="download-extras-settings__field-label">
            Offcloud API Token
            <a
              href="https://offcloud.com/account"
              target="_blank"
              rel="noopener noreferrer"
              className="download-extras-settings__link"
            >
              (pegar token)
            </a>
          </span>
          <input
            type="password"
            value={creds.offcloud_token ?? ''}
            placeholder="Cole seu token aqui"
            onChange={(e) => handleFieldChange('offcloud_token', e.target.value)}
          />
        </label>
      </div>

      <div className="download-extras-settings__actions">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="download-extras-settings__btn"
          disabled={saving}
        >
          {saving ? 'Salvando...' : saved ? ' Salvo' : 'Salvar'}
        </button>
      </div>

      <details className="download-extras-settings__help">
        <summary>Como funciona?</summary>
        <ul>
          <li>
            <strong>Debrid services:</strong> Pegam um magnet/torrent e retornam um link HTTP
            direto. Mais rapido que torrent puro, e contorna bloqueos de ISP.
          </li>
          <li>
            <strong>Hoster scrapers (Mediafire, PixelDrain):</strong> Funcionam automaticamente
            quando voc cola um link desses sites  sem precisar configurar nada.
          </li>
          <li>
            <strong>TorBox e Premiumize:</strong> Implementao prevista para v2. Por entinto,
            use Real-Debrid, AllDebrid ou Offcloud.
          </li>
        </ul>
      </details>
    </section>
  )
}
