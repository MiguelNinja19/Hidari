import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { addSource, fetchSources } from './features/sources/sourcesSlice'
import {
  enqueueJob,
  fetchJobs,
  pauseJob,
  resumeJob,
} from './features/queue/queueSlice'
import { queueApi } from './shared/api/tauri/queueApi'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import type { CatalogGame, DownloadJob, DownloadOption } from './shared/types/contracts'
import './App.css'

type NavTab = 'discover' | 'library' | 'downloads' | 'settings'

function buildCoverCandidates(coverUrl?: string | null): string[] {
  if (!coverUrl) return []
  const out = [coverUrl]
  const appId = coverUrl.match(/\/steam\/apps\/(\d+)\//)?.[1]
  if (!appId) return out
  out.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`)
  out.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`)
  out.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`)
  out.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`)
  return [...new Set(out)]
}

function CatalogCover({
  title,
  coverUrl,
  onExhausted,
}: {
  title: string
  coverUrl?: string | null
  onExhausted?: () => void
}) {
  const candidates = useMemo(() => buildCoverCandidates(coverUrl), [coverUrl])
  const [candidateIndex, setCandidateIndex] = useState(0)

  useEffect(() => {
    setCandidateIndex(0)
  }, [coverUrl])

  useEffect(() => {
    if (candidateIndex >= candidates.length) {
      onExhausted?.()
    }
  }, [candidateIndex, candidates.length, onExhausted])

  const activeCover = candidates[candidateIndex]
  if (!activeCover) {
    return (
      <div className="game-card__placeholder" aria-hidden="true">
        <span>{title.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  return (
    <img
      src={activeCover}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        setCandidateIndex((idx) => idx + 1)
      }}
    />
  )
}

const SETTING_KEY = {
  installOrganization: 'install_organization',
  afterInstallAction: 'after_install_action',
  verifyAfterDownload: 'verify_after_download',
  removeTempFiles: 'remove_temp_files',
  downloadSpeedLimitBps: 'download_speed_limit_bps',
  disabledHydraSourceIds: 'disabled_hydra_source_ids',
} as const

const speedKeyToBps = (k: string) => {
  switch (k) {
    case '50mb':
      return 50 * 1024 * 1024
    case '20mb':
      return 20 * 1024 * 1024
    case '10mb':
      return 10 * 1024 * 1024
    default:
      return 0
  }
}

const bpsToSpeedKey = (value: string | null | undefined) => {
  if (value == null || value === '' || value === '0') return 'ilimitado'
  const n = Number(value)
  if (n === 50 * 1024 * 1024) return '50mb'
  if (n === 20 * 1024 * 1024) return '20mb'
  if (n === 10 * 1024 * 1024) return '10mb'
  return 'ilimitado'
}

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)

  const [sourceUrl, setSourceUrl] = useState<string>('')
  const [discoverSearch, setDiscoverSearch] = useState<string>('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState<string>('')
  const [savePathError, setSavePathError] = useState<string>('')
  const [discoverError, setDiscoverError] = useState<string>('')
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null)
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(null)
  const [discoverPickOptions, setDiscoverPickOptions] = useState<DownloadOption[]>([])
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false)
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(null)
  const [seedTorrentsEnabled, setSeedTorrentsEnabled] = useState<boolean>(true)
  const [verifyAfterDownload, setVerifyAfterDownload] = useState<boolean>(true)
  const [removeTemporaryFiles, setRemoveTemporaryFiles] = useState<boolean>(true)
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState<string>('ilimitado')
  const [installOrganization, setInstallOrganization] = useState<string>('separate-folder')
  const [afterInstallAction, setAfterInstallAction] = useState<string>('ask')
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([])
  const [diskFreeBytes, setDiskFreeBytes] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [libraryFilter, setLibraryFilter] = useState<string>('')

  useEffect(() => {
    void dispatch(fetchSources())
    void sourcesApi.syncSources().then(() => dispatch(fetchSources()))
    void dispatch(fetchJobs())

    const polling = window.setInterval(() => {
      void dispatch(fetchJobs())
    }, 5000)

    void (async () => {
      try {
        const path = await sourcesApi.getDefaultDownloadPath()
        if (path) setDefaultDownloadPath(path)
        const enabled = await sourcesApi.getSeedTorrentsEnabled()
        setSeedTorrentsEnabled(enabled)
        const [org, after, ver, rem, speed, dis] = await Promise.all([
          sourcesApi.getAppSetting(SETTING_KEY.installOrganization),
          sourcesApi.getAppSetting(SETTING_KEY.afterInstallAction),
          sourcesApi.getAppSetting(SETTING_KEY.verifyAfterDownload),
          sourcesApi.getAppSetting(SETTING_KEY.removeTempFiles),
          sourcesApi.getAppSetting(SETTING_KEY.downloadSpeedLimitBps),
          sourcesApi.getAppSetting(SETTING_KEY.disabledHydraSourceIds),
        ])
        if (org) setInstallOrganization(org)
        if (after) setAfterInstallAction(after)
        if (ver !== null) setVerifyAfterDownload(ver === '1' || ver === 'true')
        if (rem !== null) setRemoveTemporaryFiles(rem === '1' || rem === 'true')
        if (speed !== null) setDownloadSpeedLimit(bpsToSpeedKey(speed))
        if (dis) {
          try {
            const arr = JSON.parse(dis) as unknown
            if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
              setDisabledSourceIds(arr)
            }
          } catch {
            // ignora JSON inválido
          }
        }
      } catch {
        // Tauri indisponível (ex.: dev no browser)
      }
    })()

    return () => {
      window.clearInterval(polling)
    }
  }, [dispatch])

  useEffect(() => {
    if (activeTab !== 'settings') return
    let cancelled = false
    const run = async () => {
      const p = defaultDownloadPath.trim()
      if (!p) {
        if (!cancelled) setDiskFreeBytes(null)
        return
      }
      const bytes = await sourcesApi.getDiskFreeBytesForPath(p)
      if (!cancelled) setDiskFreeBytes(bytes)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, defaultDownloadPath])

  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [failedCoverIds, setFailedCoverIds] = useState<string[]>([])

  const visibleCatalogGames = useMemo(
    () => catalogGames.filter((g) => !!g.coverUrl && !failedCoverIds.includes(g.id)),
    [catalogGames, failedCoverIds],
  )

  useEffect(() => {
    let cancelled = false
    const delay = discoverSearch.trim().length >= 2 ? 420 : 0
    const timer = window.setTimeout(() => {
      setCatalogLoading(true)
      void (async () => {
        try {
          const rows = await sourcesApi.searchGameCatalog({ query: discoverSearch })
          if (!cancelled) {
            setCatalogGames(rows)
            setFailedCoverIds([])
          }
        } catch {
          if (!cancelled) setCatalogGames([])
        } finally {
          if (!cancelled) setCatalogLoading(false)
        }
      })()
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [discoverSearch])

  const closeDiscoverPicker = useCallback(() => {
    setDiscoverPickGame(null)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(false)
  }, [])

  const openDiscoverPicker = useCallback((game: CatalogGame) => {
    setDiscoverError('')
    setDiscoverPickGame(game)
    setDiscoverPickOptions([])
    setDiscoverPickError(null)
    setDiscoverPickLoading(true)
    void (async () => {
      try {
        const rows = await sourcesApi.searchDownloadOptions({ query: game.title })
        setDiscoverPickOptions(rows)
        if (rows.length === 0) {
          setDiscoverPickError(
            'Nenhuma ligação encontrada para este título. Confirme que tem fontes ativas (ex. FitGirl) em Configurações.',
          )
        }
      } catch {
        setDiscoverPickOptions([])
        setDiscoverPickError('Não foi possível consultar as fontes. Verifique a ligação e tente de novo.')
      } finally {
        setDiscoverPickLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!discoverPickGame) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiscoverPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [discoverPickGame, closeDiscoverPicker])

  const isSourceEnabled = (sourceId: string) => !disabledSourceIds.includes(sourceId)

  const canSubmitSource = useMemo(() => sourceUrl.trim().length > 0, [sourceUrl])

  const libraryItems = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase()
    const sorted = [...jobs].sort((a, b) => {
      const updatedA = a.updatedAt ?? a.createdAt ?? ''
      const updatedB = b.updatedAt ?? b.createdAt ?? ''
      return updatedB.localeCompare(updatedA)
    })
    if (!normalizedFilter) return sorted
    return sorted.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedFilter) ||
        item.url.toLowerCase().includes(normalizedFilter),
    )
  }, [jobs, libraryFilter])

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmitSource) return
    void dispatch(addSource({ url: sourceUrl.trim() }))
    setSourceUrl('')
  }

  const handleSaveInstallSettings = async () => {
    const path = defaultDownloadPath.trim()
    if (!path) {
      setSavePathError('Indique uma pasta de destino.')
      return
    }
    setSavePathError('')
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      await sourcesApi.setAppSetting(SETTING_KEY.installOrganization, installOrganization)
      await sourcesApi.setAppSetting(SETTING_KEY.afterInstallAction, afterInstallAction)
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao salvar definições de instalação.')
    }
  }

  const handleToggleVerify = async (next: boolean) => {
    setVerifyAfterDownload(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.verifyAfterDownload, next ? '1' : '0')
    } catch (error) {
      setVerifyAfterDownload((v) => !v)
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar verificação.')
    }
  }

  const handleToggleRemoveTemp = async (next: boolean) => {
    setRemoveTemporaryFiles(next)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.removeTempFiles, next ? '1' : '0')
    } catch (error) {
      setRemoveTemporaryFiles((v) => !v)
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar opção de ficheiros temporários.')
    }
  }

  const handleSpeedLimitChange = async (value: string) => {
    setDownloadSpeedLimit(value)
    try {
      await sourcesApi.setAppSetting(SETTING_KEY.downloadSpeedLimitBps, String(speedKeyToBps(value)))
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao guardar limite de velocidade.')
    }
  }

  const handleToggleSource = (sourceId: string) => {
    setDisabledSourceIds((prev) => {
      const isDisabled = prev.includes(sourceId)
      const next = isDisabled ? prev.filter((x) => x !== sourceId) : [...prev, sourceId]
      void sourcesApi
        .setAppSetting(SETTING_KEY.disabledHydraSourceIds, JSON.stringify(next))
        .catch((error) => {
          setSavePathError(
            error instanceof Error ? error.message : 'Falha ao guardar fontes ativas.',
          )
        })
      return next
    })
  }

  const handleEnqueueFromDiscover = async (title: string, url: string) => {
    setDiscoverError('')
    setDiscoverBusy(url)
    try {
      const hasPath = defaultDownloadPath.trim().length > 0
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!hasPath && !fromDb) {
        setDiscoverError('Defina a pasta padrão em Configurações antes de baixar.')
        return
      }
      const destPath = defaultDownloadPath.trim() || fromDb || undefined
      await dispatch(
        enqueueJob({ title, url, destPath: destPath ?? undefined }),
      ).unwrap()
      closeDiscoverPicker()
      setActiveTab('downloads')
    } catch (error) {
      setDiscoverError(
        error instanceof Error ? error.message : 'Falha ao adicionar o download à fila.',
      )
    } finally {
      setDiscoverBusy(null)
    }
  }

  const handleSelectDefaultPath = async () => {
    setSavePathError('')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Selecione a pasta padrão de downloads',
      defaultPath: defaultDownloadPath || undefined,
    })
    if (typeof selected === 'string') {
      setDefaultDownloadPath(selected)
      try {
        await sourcesApi.setDefaultDownloadPath(selected)
      } catch {
        setSavePathError('Nao foi possivel salvar a pasta. Execute com "npm run tauri:dev".')
      }
    }
  }

  const handleToggleSeed = async (enabled: boolean) => {
    setSeedTorrentsEnabled(enabled)
    try {
      await sourcesApi.setSeedTorrentsEnabled(enabled)
    } catch (error) {
      setSeedTorrentsEnabled((prev) => !prev)
      setSavePathError(
        error instanceof Error ? error.message : 'Falha ao salvar preferência de semeadura.',
      )
    }
  }

  const formatSpeed = (speedBytesPerSec?: number) => {
    const speed = speedBytesPerSec ?? 0
    if (speed >= 1024 * 1024) return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
    if (speed >= 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${speed} B/s`
  }

  const formatSize = (bytes?: number) => {
    const value = bytes ?? 0
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${value} B`
  }

  const formatEta = (seconds?: number) => {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
    if (seconds > 86400 * 2) return null
    const s = Math.floor(seconds)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return `${h} h ${m % 60} min`
  }

  const jobStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Na fila'
      case 'downloading':
        return 'A transferir'
      case 'seeding':
        return 'A semear'
      case 'retrying':
        return 'A repetir'
      case 'paused':
        return 'Pausado'
      case 'completed':
        return 'Concluído'
      case 'failed':
        return 'Falhou'
      case 'cancelled':
        return 'Cancelado'
      default:
        return status
    }
  }

  const showEtaForJob = (job: DownloadJob) => {
    if (job.status !== 'downloading' && job.status !== 'retrying') return false
    const eta = job.etaSeconds
    return eta != null && Number.isFinite(eta) && eta > 0 && eta < 86400 * 2
  }

  const renderDiscover = () => {
    return (
      <section className="page-stack page-stack--discover">
        <article className="glass-card">
          <header className="section-row">
            <div>
              <h2>Explorar</h2>
              <p className="small-note">
                Pesquise no catálogo (2+ letras): lista local + Steam opcional (cache 24h). Toque num jogo para ver
                as ligações das suas fontes e escolher o download.
              </p>
            </div>
          </header>
          <div className="home-controls">
            <div className="discover-search discover-search--compact">
              <span className="discover-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="6" />
                  <path d="M20 20l-4.2-4.2" />
                </svg>
              </span>
              <input
                placeholder="Pesquisar no catálogo (mín. 2 caracteres)…"
                value={discoverSearch}
                onChange={(event) => setDiscoverSearch(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          {discoverError && !discoverPickGame ? (
            <p className="error discover-error">{discoverError}</p>
          ) : null}

          {visibleCatalogGames.length > 0 ? (
            <>
              <p className="small-note discover-grid-label">
                Catálogo ({visibleCatalogGames.length})
                {catalogLoading ? ' · a atualizar…' : ''}
              </p>
              <ul className="game-grid">
                {visibleCatalogGames.map((game) => (
                  <li key={game.id} className="game-card">
                    <button
                      type="button"
                      className="game-card__hitbox"
                      onClick={() => openDiscoverPicker(game)}
                      aria-label={`Ver opções de download: ${game.title}`}
                    >
                      <CatalogCover
                        title={game.title}
                        coverUrl={game.coverUrl}
                        onExhausted={() => {
                          setFailedCoverIds((prev) =>
                            prev.includes(game.id) ? prev : [...prev, game.id],
                          )
                        }}
                      />
                      <div className="game-card__overlay">
                        <strong>{game.title}</strong>
                        {game.genre.trim().toLowerCase() !== 'steam' ? (
                          <span>{game.genre}</span>
                        ) : null}
        </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : catalogLoading ? (
            <p className="small-note discover-grid-label">Catálogo (a atualizar…)</p>
          ) : (
            <p className="small-note discover-empty-hint">
              {discoverSearch.trim().length < 2
                ? 'Escreva pelo menos 2 letras para ver jogos no catálogo.'
                : 'Nenhum jogo encontrado para esta pesquisa.'}
            </p>
          )}

          {discoverPickGame ? (
            <div
              className="discover-modal-backdrop"
              role="presentation"
              onClick={() => closeDiscoverPicker()}
            >
              <div
                className="discover-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="discover-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="discover-modal__header">
        <div>
                    <h3 id="discover-modal-title">{discoverPickGame.title}</h3>
                    <p className="small-note discover-modal__subtitle">
                      Ligações encontradas nas suas fontes ativas
          </p>
        </div>
        <button
          type="button"
                    className="discover-modal__close"
                    onClick={() => closeDiscoverPicker()}
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </header>
                {discoverPickLoading ? (
                  <p className="small-note discover-modal__body">A consultar fontes…</p>
                ) : null}
                {!discoverPickLoading && discoverPickError ? (
                  <p className="error discover-modal__body">{discoverPickError}</p>
                ) : null}
                {discoverError && discoverPickGame ? (
                  <p className="error discover-modal__body">{discoverError}</p>
                ) : null}
                {!discoverPickLoading && discoverPickOptions.length > 0 ? (
                  <ul className="discover-source-list discover-source-list--modal">
                    {discoverPickOptions.map((opt, index) => (
                      <li key={`${opt.url}-${index}`} className="discover-source-row">
                        <div className="discover-source-row__text">
                          <strong>{opt.title}</strong>
                          <span className="small-note">
                            {opt.sourceName} · {opt.downloadType}
                            {opt.quality ? ` · ${opt.quality}` : ''}
                          </span>
                        </div>
                        <button
                          className="btn btn-outline"
                          type="button"
                          disabled={discoverBusy === opt.url}
                          onClick={() => void handleEnqueueFromDiscover(opt.title, opt.url)}
                        >
                          {discoverBusy === opt.url ? 'A adicionar…' : 'Baixar'}
        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </article>
      </section>
    )
  }

  const renderDownloads = () => {
    const queuedJobs = jobs.filter((job) => job.status !== 'completed')

    return (
      <article className="glass-card downloads-page">
        <header className="section-row downloads-page__header">
          <div>
            <h2>Downloads</h2>
            <p className="small-note">Acompanhe o progresso dos seus downloads.</p>
          </div>
          <button
            className="btn btn-outline btn-downloads-pause-all"
            type="button"
            onClick={() => {
              queuedJobs.forEach((job) => {
                if (job.status === 'downloading' || job.status === 'pending' || job.status === 'retrying') {
                  void dispatch(pauseJob(job.id))
                }
              })
            }}
          >
            Pausar todos
          </button>
        </header>

        {queueError ? <p className="error">{queueError}</p> : null}

        <ul className="download-list download-list--compact">
          {queuedJobs.map((job) => (
            <li key={job.id} className="download-item download-item--compact">
              <div className="download-item__thumb">
                <CatalogCover title={job.title} coverUrl={null} />
              </div>
              <div className="download-item__main">
                <div className="download-item__header">
                  <strong>{job.title}</strong>
                </div>
                <div className="progress-bar progress-bar--large">
                  <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                </div>
                <div className="download-item__meta download-item__meta--compact download-item__meta--detail">
                  <span>
                    <span className="download-item__status-tag">{jobStatusLabel(job.status)}</span>
                    {' · '}
                    {formatSize(job.bytesDownloaded)}
                    {' / '}
                    {job.totalBytes > 0 ? formatSize(job.totalBytes) : 'tamanho desconhecido'}
                  </span>
                  {(job.status === 'downloading' ||
                    job.status === 'retrying' ||
                    job.status === 'seeding') &&
                  (job.speedBps ?? 0) > 0 ? (
                    <span>
                      {job.status === 'seeding' ? 'Velocidade (semear)' : 'Velocidade'}:{' '}
                      {formatSpeed(job.speedBps)}
                    </span>
                  ) : null}
                  {showEtaForJob(job) && formatEta(job.etaSeconds) ? (
                    <span>Tempo restante (est.): {formatEta(job.etaSeconds)}</span>
                  ) : null}
                  {job.errorMsg ? <span className="error">{job.errorMsg}</span> : null}
                </div>
              </div>
              <div className="download-item__actions">
                <span className="download-item__percent">{Math.round(job.progress)}%</span>
                {(job.status === 'downloading' ||
                  job.status === 'pending' ||
                  job.status === 'retrying' ||
                  job.status === 'seeding') && (
                  <button
                    className="download-action-circle"
                    type="button"
                    onClick={() => void dispatch(pauseJob(job.id))}
                    aria-label={`Pausar ${job.title}`}
                  >
                    ❚❚
                  </button>
                )}
                {(job.status === 'paused' || job.status === 'failed') && (
                  <button
                    className="download-action-circle"
                    type="button"
                    onClick={() => void dispatch(resumeJob(job.id))}
                    aria-label={`Continuar ${job.title}`}
                  >
                    ▶
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!queueLoading && queuedJobs.length === 0 ? (
          <p className="empty-message">Nenhum download em andamento no momento.</p>
        ) : null}

        <footer className="downloads-footer">
          <div className="downloads-footer__meta">
            <span>
              Velocidade combinada:{' '}
              {formatSpeed(queuedJobs.reduce((sum, job) => sum + (job.speedBps ?? 0), 0))}
            </span>
            <span>
              {queuedJobs.length} item(ns) na fila (inclui semeadura se aplicável)
            </span>
          </div>
        </footer>
      </article>
    )
  }

  const renderLibrary = () => (
    <article className="glass-card library-page">
      <div className="library-page__controls">
        <div className="library-toolbar">
          <button className="chip chip--active" type="button">Todos</button>
          <button className="chip" type="button">Instalados</button>
          <button className="chip" type="button">Não instalados</button>
          <button className="chip" type="button">Favoritos</button>
        </div>
        <div className="library-controls-right">
          <div className="view-actions view-actions--compact">
            <button className="btn btn-outline" type="button" aria-label="Visualização em grade">⊞</button>
            <button className="btn btn-outline" type="button" aria-label="Visualização em lista">☰</button>
          </div>
          <button className="library-sort-btn" type="button">
            Recentes <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>

      <div className="library-filter-row">
        <div className="source-form source-form--single">
          <input
            placeholder="Filtrar por nome..."
            value={libraryFilter}
            onChange={(event) => setLibraryFilter(event.target.value)}
          />
        </div>
      </div>

      <ul className="game-grid library-grid-modern">
        {libraryItems.map((item) => (
          <li key={item.id} className="game-card library-game-card">
            <CatalogCover title={item.title} coverUrl={null} />
            <div className="game-card__overlay library-game-card__overlay">
              <strong>{item.title}</strong>
              <span>
                {item.status === 'completed' || item.status === 'seeding'
                  ? 'Instalado'
                  : item.status === 'downloading' || item.status === 'pending' || item.status === 'retrying'
                    ? 'A transferir'
                    : item.status === 'paused'
                      ? 'Pausado'
                      : item.status === 'failed'
                        ? 'Falhou'
                        : 'Não instalado'}
              </span>
            </div>
            {(item.status === 'completed' || item.status === 'seeding') && (
              <button className="card-action card-action--library" type="button" onClick={() => { void queueApi.launchJob(item.id) }}>
                ▷
              </button>
            )}
            {(item.status === 'downloading' || item.status === 'pending' || item.status === 'retrying') && (
              <button className="card-action card-action--library card-action--download-indicator" type="button" onClick={() => setActiveTab('downloads')}>
                ↓
              </button>
            )}
            {(item.status === 'paused' || item.status === 'failed') && (
              <button className="card-action card-action--library" type="button" onClick={() => void dispatch(resumeJob(item.id))}>
                ↻
              </button>
            )}
            </li>
        ))}
          </ul>
      {libraryItems.length === 0 ? <p className="empty-message">Nenhum jogo encontrado.</p> : null}
    </article>
  )

  const renderSettings = () => (
    <article className="glass-card settings-page">
      <header className="section-row">
        <div>
          <h2>Configurações</h2>
          <p className="small-note">Personalize sua experiência.</p>
        </div>
      </header>

      <section className="settings-grid settings-grid-modern">
        <article className="settings-panel settings-panel-modern">
          <h3>Local de instalação</h3>
          <p className="small-note">Escolha onde os jogos serão baixados e instalados.</p>
          <div className="source-form source-form--single">
            <input
              placeholder="C:\\Games\\Downloads"
              value={defaultDownloadPath}
              onChange={(event) => setDefaultDownloadPath(event.target.value)}
            />
            <button className="btn btn-outline" type="button" onClick={() => void handleSelectDefaultPath()}>
              Alterar
            </button>
          </div>
          <p className="small-note">
            Espaço disponível:{' '}
            <span className="settings-highlight">
              {diskFreeBytes != null ? formatSize(diskFreeBytes) : '—'}
            </span>
          </p>
          <div className="settings-select-row">
            <label>Organização</label>
            <select
              className="settings-select"
              value={installOrganization}
              onChange={(event) => setInstallOrganization(event.target.value)}
            >
              <option value="separate-folder">Criar pasta para cada jogo</option>
              <option value="single-folder">Salvar tudo na mesma pasta</option>
            </select>
          </div>
          <div className="settings-select-row">
            <label>Após a instalação</label>
            <select
              className="settings-select"
              value={afterInstallAction}
              onChange={(event) => setAfterInstallAction(event.target.value)}
            >
              <option value="ask">Perguntar o que fazer</option>
              <option value="open-folder">Abrir pasta</option>
              <option value="launch-game">Iniciar jogo</option>
            </select>
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="button" onClick={() => void handleSaveInstallSettings()}>
              Salvar
            </button>
          </div>
          {savePathError ? <p className="error">{savePathError}</p> : null}
        </article>

        <article className="settings-panel settings-panel-modern">
          <h3>Fontes de download</h3>
          <p className="small-note">Selecione as fontes de onde os jogos serão baixados.</p>
          <ul className="source-toggles source-toggles-modern">
            {sources.map((source) => (
              <li key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.url.replace(/^https?:\/\//, '')}</span>
                </div>
                <button
                  type="button"
                  className={isSourceEnabled(source.id) ? 'switch-btn switch-btn--on' : 'switch-btn'}
                  aria-label={`Ativar ${source.name}`}
                  onClick={() => handleToggleSource(source.id)}
                />
            </li>
            ))}
          </ul>
          <p className="small-note settings-hint">Fontes são agregadas de várias comunidades.</p>
          <form onSubmit={handleAddSource} className="source-form source-form--single">
            <input
              placeholder="URL da fonte (.json)"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
            <button className="btn btn-outline" type="submit" disabled={!canSubmitSource}>
              Adicionar
            </button>
          </form>
        </article>
      </section>
      <section className="settings-panel settings-panel-modern settings-panel-full">
        <h3>Outras opções</h3>
        <div className="settings-option-row">
          <div>
            <strong>Verificar arquivos após o download</strong>
            <span>Garante que os arquivos baixados não estão corrompidos.</span>
          </div>
          <button
            type="button"
            className={verifyAfterDownload ? 'switch-btn switch-btn--on' : 'switch-btn'}
            aria-label="Verificar arquivos"
            onClick={() => void handleToggleVerify(!verifyAfterDownload)}
          />
        </div>
        <div className="settings-option-row">
          <div>
            <strong>Limitar velocidade de download</strong>
            <span>Defina um limite máximo para os downloads.</span>
          </div>
          <select
            className="settings-select settings-select--small"
            value={downloadSpeedLimit}
            onChange={(event) => void handleSpeedLimitChange(event.target.value)}
          >
            <option value="ilimitado">Ilimitado</option>
            <option value="50mb">50 MB/s</option>
            <option value="20mb">20 MB/s</option>
            <option value="10mb">10 MB/s</option>
          </select>
        </div>
        <div className="settings-option-row">
          <div>
            <strong>Excluir arquivos temporários</strong>
            <span>Arquivos temporários serão removidos após a instalação.</span>
          </div>
          <button
            type="button"
            className={removeTemporaryFiles ? 'switch-btn switch-btn--on' : 'switch-btn'}
            aria-label="Excluir temporários"
            onClick={() => void handleToggleRemoveTemp(!removeTemporaryFiles)}
          />
        </div>
        <div className="settings-option-row">
          <div>
            <strong>Semear torrent após concluir</strong>
            <span>Mantém o compartilhamento ativo após finalizar o download.</span>
          </div>
          <button
            type="button"
            className={seedTorrentsEnabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
            aria-label="Semear torrent após concluir"
            onClick={() => void handleToggleSeed(!seedTorrentsEnabled)}
          />
        </div>
        <div className="settings-option-row settings-option-row--stacked">
          <div>
            <strong>Estado das fontes</strong>
            <span>Resumo das fontes configuradas no sistema.</span>
          </div>
          {sourcesLoading ? <p>Carregando fontes...</p> : null}
          {sourcesError ? <p className="error">{sourcesError}</p> : null}
          {!sourcesLoading && sources.length === 0 ? <p className="empty-message">Nenhuma fonte configurada ainda.</p> : null}
          {!sourcesLoading && sources.length > 0 ? (
            <p className="small-note">{sources.length} fonte(s) configurada(s).</p>
          ) : null}
        </div>
      </section>
    </article>
  )

  const renderMainContent = () => {
    switch (activeTab) {
      case 'discover':
        return renderDiscover()
      case 'library':
        return renderLibrary()
      case 'downloads':
        return renderDownloads()
      case 'settings':
        return renderSettings()
      default:
        return null
    }
  }

  return (
    <main className="nova-shell">
      <aside className="sidebar">
        <div className="sidebar__logo">N O V A</div>
        <nav className="sidebar__nav">
          <button className={activeTab === 'discover' ? 'sidebar-link sidebar-link--active' : 'sidebar-link'} type="button" onClick={() => setActiveTab('discover')}>Explorar</button>
          <button className={activeTab === 'downloads' ? 'sidebar-link sidebar-link--active' : 'sidebar-link'} type="button" onClick={() => setActiveTab('downloads')}>Downloads</button>
          <button className={activeTab === 'library' ? 'sidebar-link sidebar-link--active' : 'sidebar-link'} type="button" onClick={() => setActiveTab('library')}>Biblioteca</button>
          <button className={activeTab === 'settings' ? 'sidebar-link sidebar-link--active' : 'sidebar-link'} type="button" onClick={() => setActiveTab('settings')}>Configurações</button>
        </nav>
        <div className="sidebar__theme">Tema escuro</div>
      </aside>

      <section className="main-panel">
        <section className="main-content">{renderMainContent()}</section>
      </section>
    </main>
  )
}

export default App
