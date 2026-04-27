import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { addSource, deleteSource, fetchSources } from './features/sources/sourcesSlice'
import {
  cancelJob,
  clearCompletedJobs,
  clearHistoryLocally,
  enqueueJob,
  fetchJobs,
  pauseJob,
  removeJobLocally,
  resumeJob,
} from './features/queue/queueSlice'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import type { DownloadJob, DownloadOption, LocalLibraryItem } from './shared/types/contracts'
import './App.css'

type NavTab = 'discover' | 'library' | 'downloads' | 'settings'

const TAB_LABEL: Record<NavTab, string> = {
  discover: 'Descobrir',
  library: 'Biblioteca',
  downloads: 'Downloads',
  settings: 'Configurações',
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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searching, setSearching] = useState<boolean>(false)
  const [searchResults, setSearchResults] = useState<DownloadOption[]>([])
  const [searchError, setSearchError] = useState<string>('')
  const [defaultDownloadPath, setDefaultDownloadPath] = useState<string>('')
  const [savePathError, setSavePathError] = useState<string>('')
  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [libraryFilter, setLibraryFilter] = useState<string>('')
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [hiddenLocalPaths, setHiddenLocalPaths] = useState<string[]>([])
  const [localLibraryError, setLocalLibraryError] = useState<string>('')

  useEffect(() => {
    void dispatch(fetchSources())
    void sourcesApi.syncSources().then(() => dispatch(fetchSources()))
    void dispatch(fetchJobs())

    const polling = window.setInterval(() => {
      void dispatch(fetchJobs())
    }, 5000)

    void sourcesApi.getDefaultDownloadPath().then((path) => {
      if (path) setDefaultDownloadPath(path)
    })
    void sourcesApi
      .scanDefaultDownloadPath()
      .then((items) => {
        setLocalLibraryItems(items)
        setLocalLibraryError('')
      })
      .catch((error) => {
        setLocalLibraryItems([])
        setLocalLibraryError(
          error instanceof Error ? error.message : 'Nao foi possivel ler a pasta selecionada.',
        )
      })

    return () => {
      window.clearInterval(polling)
    }
  }, [dispatch])

  const canSubmitSource = useMemo(() => sourceUrl.trim().length > 0, [sourceUrl])

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status === 'downloading' || job.status === 'pending' || job.status === 'paused',
      ),
    [jobs],
  )
  const completedJobs = useMemo(() => jobs.filter((job) => job.status === 'completed'), [jobs])
  const currentJob = useMemo(
    () => jobs.find((job) => job.status === 'downloading') ?? activeJobs[0],
    [jobs, activeJobs],
  )
  const currentProgress = Math.round(currentJob?.progress ?? 0)

  const libraryItems = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase()
    const sorted = [...jobs]
      .filter((job) => job.status === 'completed')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (!normalizedFilter) return sorted
    return sorted.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedFilter) ||
        item.url.toLowerCase().includes(normalizedFilter),
    )
  }, [jobs, libraryFilter])

  const isTemporaryDownloadFile = (fileName: string) => {
    const normalized = fileName.toLowerCase()
    return normalized.endsWith('.aria2') || normalized.endsWith('.torrent')
  }

  const localHistoryItems = useMemo(
    () =>
      localLibraryItems.filter(
        (item) =>
          !item.isDir && !hiddenLocalPaths.includes(item.path) && !isTemporaryDownloadFile(item.name),
      ),
    [hiddenLocalPaths, localLibraryItems],
  )

  const filteredLocalLibraryItems = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase()
    const completedTitles = new Set(
      completedJobs.map((job) => job.title.trim().toLowerCase()).filter((title) => title.length > 0),
    )

    return localLibraryItems.filter((item) => {
      if (hiddenLocalPaths.includes(item.path)) return false
      if (isTemporaryDownloadFile(item.name)) return false
      const name = item.name.toLowerCase()
      const matchFilter = normalizedFilter.length === 0 || name.includes(normalizedFilter)
      if (!matchFilter) return false

      // Biblioteca exibe apenas itens vinculados a downloads concluidos.
      for (const title of completedTitles) {
        if (name.includes(title)) return true
      }
      return false
    })
  }, [completedJobs, hiddenLocalPaths, libraryFilter, localLibraryItems])

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmitSource) return
    void dispatch(addSource({ url: sourceUrl.trim() }))
    setSourceUrl('')
  }

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (query.length < 2) return
    setSearching(true)
    setSearchError('')
    try {
      const results = await sourcesApi.searchDownloadOptions({ query })
      setSearchResults(results)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Falha na busca.')
    } finally {
      setSearching(false)
    }
  }

  const handleSaveDefaultPath = async () => {
    const path = defaultDownloadPath.trim()
    if (!path) return
    setSavePathError('')
    try {
      await sourcesApi.setDefaultDownloadPath(path)
      const items = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(items)
      setLocalLibraryError('')
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao salvar pasta padrão.')
      setLocalLibraryError(error instanceof Error ? error.message : 'Falha ao ler a pasta selecionada.')
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
        const items = await sourcesApi.scanDefaultDownloadPath()
        setLocalLibraryItems(items)
        setLocalLibraryError('')
      } catch {
        setLocalLibraryItems([])
        setLocalLibraryError('Nao foi possivel ler a pasta. Execute com "npm run tauri:dev".')
      }
    }
  }

  const handleDeleteLocalItem = async (path: string) => {
    const confirmed = window.confirm('Tem certeza que deseja apagar este arquivo/pasta do disco?')
    if (!confirmed) return

    try {
      await sourcesApi.deleteLocalLibraryItem(path)
      const items = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(items)
      setHiddenLocalPaths((current) => current.filter((value) => value !== path))
      setLocalLibraryError('')
    } catch (error) {
      setLocalLibraryError(error instanceof Error ? error.message : 'Falha ao apagar item local.')
    }
  }

  const formatSpeed = (speedBytesPerSec?: number) => {
    const speed = speedBytesPerSec ?? 0
    if (speed >= 1024 * 1024) return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
    if (speed >= 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${speed} B/s`
  }

  const formatEta = (etaSeconds?: number) => {
    const eta = etaSeconds ?? 0
    if (eta <= 0) return '--'
    if (eta < 60) return `${eta}s`
    const minutes = Math.floor(eta / 60)
    const seconds = eta % 60
    return `${minutes}m ${seconds}s`
  }

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'downloading':
        return 'Baixando'
      case 'pending':
        return 'Na fila'
      case 'paused':
        return 'Pausado'
      case 'completed':
        return 'Concluído'
      case 'cancelled':
        return 'Cancelado'
      case 'failed':
        return 'Falhou'
      case 'retrying':
        return 'Tentando novamente'
      default:
        return status
    }
  }

  const formatSize = (bytes?: number) => {
    const value = bytes ?? 0
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${value} B`
  }

  const formatJobDetail = (job: DownloadJob) => {
    const detail = job.errorMsg?.trim()
    if (!detail) return ''
    if (detail.includes('Conectando peers'))
      return 'Conectando à rede torrent e procurando seeds/peers...'
    if (detail.includes('no_peers_found'))
      return 'Sem peers disponíveis para este magnet agora. Tente outra fonte.'
    if (detail.includes('default_download_path_not_configured'))
      return 'Defina a pasta padrão de download antes de iniciar.'
    return detail
  }

  const formatResultLinkLabel = (url: string) => {
    if (!url) return 'Link indisponível'
    if (url.startsWith('magnet:?')) {
      const btihMatch = url.match(/btih:([a-zA-Z0-9]+)/i)
      const hash = btihMatch?.[1]
      if (hash) return `Magnet • ${hash.slice(0, 10)}...${hash.slice(-6)}`
      return 'Magnet link'
    }
    try {
      const parsed = new URL(url)
      return `${parsed.hostname}${parsed.pathname.length > 18 ? `${parsed.pathname.slice(0, 18)}...` : parsed.pathname}`
    } catch {
      return 'Link externo'
    }
  }

  const renderDiscover = () => (
    <>
      <article className="glass-card">
        <header className="card-header">
          <h2>Descobrir torrents</h2>
          <span className="card-meta">{searchResults.length} resultados</span>
        </header>
        <form onSubmit={handleSearch} className="source-form source-form--single">
          <input
            placeholder="Ex.: Devil May Cry"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={searchQuery.trim().length < 2}
          >
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {searching ? <p>Buscando nas fontes...</p> : null}
        {searchError ? <p className="error">{searchError}</p> : null}
        {!searching && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
          <p>Nenhum resultado encontrado para "{searchQuery.trim()}".</p>
        ) : null}

        <ul className="sources-list">
          {searchResults.map((option) => (
            <li key={`${option.sourceId}-${option.url}`}>
              <div>
                <strong>{option.title}</strong>
                <span>
                  {option.sourceName} - {option.downloadType} - {option.quality}
                </span>
                <span className="job-url" title={option.url}>
                  {formatResultLinkLabel(option.url)}
                </span>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void dispatch(
                    enqueueJob({
                      title: option.title,
                      url: option.url,
                    }),
                  )
                  setActiveTab('downloads')
                }}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>

        {!searching && !searchError && searchResults.length === 0 ? (
          <p className="empty-message">Faça uma busca para ver as opções disponíveis.</p>
        ) : null}
      </article>
    </>
  )

  const renderDownloads = () => (
    (() => {
      const queuedJobs = jobs.filter(
        (job) =>
          job.status !== 'completed',
      )
      const historyJobs = jobs.filter(
        (job) =>
          job.status === 'completed' ||
          job.status === 'cancelled' ||
          job.status === 'failed',
      )
      return (
        <article className="glass-card">
          <header className="card-header">
            <h2>Downloads</h2>
            <span className="card-meta">{activeJobs.length} ativos</span>
          </header>

          {queueLoading ? <p>Carregando fila...</p> : null}
          {queueError ? <p className="error">{queueError}</p> : null}

          {currentJob ? (
            <div className="download-overview">
              <div className="download-overview__header">
                <strong>{currentJob.title}</strong>
                <span>{Math.round(currentJob.progress)}%</span>
              </div>
              <div className="progress-bar progress-bar--large">
                <div
                  className="progress-fill"
                  style={{ width: `${currentJob.progress}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(currentJob.progress)}
                />
              </div>
              <div className="download-overview__meta">
                <span>Velocidade: {formatSpeed(currentJob.speedBps)}</span>
                <span>ETA: {formatEta(currentJob.etaSeconds)}</span>
                <span>
                  Dados: {formatSize(currentJob.bytesDownloaded)}
                  {currentJob.totalBytes > 0 ? ` / ${formatSize(currentJob.totalBytes)}` : ''}
                </span>
              </div>
              {currentJob.errorMsg ? (
                <p className="job-hint job-hint--prominent">{formatJobDetail(currentJob)}</p>
              ) : null}
            </div>
          ) : null}

          {jobs.length > 0 ? (
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => void dispatch(clearCompletedJobs())}
            >
              Limpar concluídos / cancelados
            </button>
          ) : null}

          <ul className="job-list">
            {queuedJobs.map((job) => (
              <li key={job.id} className="job-item">
                <div className="job-header">
                  <strong>{job.title}</strong>
                  <span className={`badge badge-${job.status}`}>{formatStatusLabel(job.status)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                </div>
                <div className="job-meta">
                  <span>{Math.round(job.progress)}%</span>
                  <span className="job-url">
                    {job.url.length > 50 ? `${job.url.slice(0, 50)}...` : job.url}
                  </span>
                </div>
                <div className="job-extra-meta">
                  <span>{formatSpeed(job.speedBps)}</span>
                  <span>ETA {formatEta(job.etaSeconds)}</span>
                  <span>
                    {formatSize(job.bytesDownloaded)}
                    {job.totalBytes > 0 ? ` / ${formatSize(job.totalBytes)}` : ''}
                  </span>
                </div>
                <div className="actions">
                  {(job.status === 'downloading' || job.status === 'pending') && (
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => void dispatch(pauseJob(job.id))}
                    >
                      Pausar
                    </button>
                  )}
                  {job.status === 'paused' && (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => void dispatch(resumeJob(job.id))}
                    >
                      Retomar
                    </button>
                  )}
                  {job.status !== 'completed' && job.status !== 'cancelled' && (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => void dispatch(cancelJob(job.id))}
                    >
                      Cancelar
                    </button>
                  )}
                  {(job.status === 'failed' || job.status === 'cancelled') && (
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => dispatch(removeJobLocally(job.id))}
                    >
                      Excluir
                    </button>
                  )}
                </div>
                {job.errorMsg ? (
                  <p className={job.status === 'failed' ? 'error' : 'job-hint'}>
                    {job.status === 'failed' ? 'Erro' : 'Detalhe'}: {formatJobDetail(job)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {!queueLoading && queuedJobs.length === 0 ? (
            <p className="empty-message">
              Nenhum download em andamento no momento.
            </p>
          ) : null}

          <header className="card-header">
            <h2>Histórico de downloads</h2>
            <span className="card-meta">{historyJobs.length} itens</span>
          </header>
          {historyJobs.length > 0 ? (
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => dispatch(clearHistoryLocally())}
            >
              Limpar histórico
            </button>
          ) : null}
          <ul className="job-list">
            {historyJobs.map((job) => (
              <li key={`history-${job.id}`} className="job-item">
                <div className="job-header">
                  <strong>{job.title}</strong>
                  <span className={`badge badge-${job.status}`}>{formatStatusLabel(job.status)}</span>
                </div>
                <div className="job-extra-meta">
                  <span>{Math.round(job.progress)}%</span>
                  <span>{formatSize(job.totalBytes > 0 ? job.totalBytes : job.bytesDownloaded)}</span>
                  <span>{new Date(job.updatedAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
          {historyJobs.length === 0 && localHistoryItems.length > 0 ? (
            <>
              <p className="small-note">
                Sem jobs no historico da fila. Mostrando arquivos encontrados na pasta selecionada.
              </p>
              <ul className="sources-list">
                {localHistoryItems.slice(0, 30).map((item) => (
                  <li key={`local-history-${item.path}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{formatSize(item.sizeBytes)}</span>
                      <span className="job-url" title={item.path}>{item.path}</span>
                    </div>
                    <button
                      className="btn btn-outline btn-small"
                      type="button"
                      onClick={() => void handleDeleteLocalItem(item.path)}
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
      )
    })()
  )

  const renderLibrary = () => (
    <article className="glass-card">
      <header className="card-header">
        <h2>Biblioteca</h2>
        <span className="card-meta">
          {libraryItems.length} downloads • {filteredLocalLibraryItems.length} arquivos locais
        </span>
      </header>

      <div className="source-form source-form--single">
        <input
          placeholder="Filtrar por nome..."
          value={libraryFilter}
          onChange={(event) => setLibraryFilter(event.target.value)}
        />
      </div>

      <ul className="library-grid">
        {libraryItems.map((item) => (
          <li key={item.id} className="library-card">
            <div className="library-card__cover" aria-hidden="true">
              <span>{item.title.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="library-card__content">
              <strong>{item.title}</strong>
              <span>{formatSize(item.totalBytes > 0 ? item.totalBytes : item.bytesDownloaded)}</span>
              <span>{Math.round(item.progress)}% • {formatStatusLabel(item.status)}</span>
              <span className="library-card__meta">Atualizado em {new Date(item.updatedAt).toLocaleString()}</span>
              {(item.status === 'paused' || item.status === 'failed') && (
                <button
                  className="btn btn-primary btn-small"
                  type="button"
                  onClick={() => void dispatch(resumeJob(item.id))}
                >
                  Continuar download
                </button>
              )}
              {(item.status === 'downloading' || item.status === 'pending') && (
                <button
                  className="btn btn-outline btn-small"
                  type="button"
                  onClick={() => setActiveTab('downloads')}
                >
                  Ver download
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <header className="card-header">
        <h2>Pasta selecionada</h2>
      </header>
      {localLibraryError ? <p className="error">{localLibraryError}</p> : null}
      <ul className="sources-list">
        {filteredLocalLibraryItems
          .slice(0, 50)
          .map((item) => (
            <li key={item.path}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.isDir ? 'Pasta' : 'Arquivo'} • {item.isDir ? '--' : formatSize(item.sizeBytes)}</span>
                <span className="job-url" title={item.path}>{item.path}</span>
              </div>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => void handleDeleteLocalItem(item.path)}
              >
                Apagar
              </button>
            </li>
          ))}
      </ul>

      {libraryItems.length === 0 && filteredLocalLibraryItems.length === 0 ? (
        <p className="empty-message">Nenhum item encontrado na pasta selecionada.</p>
      ) : null}
    </article>
  )

  const renderSettings = () => (
    <>
      <article className="glass-card">
        <header className="card-header">
          <h2>Pasta padrão de downloads</h2>
        </header>
        <div className="source-form source-form--single">
          <input
            placeholder="C:\\Games\\Downloads"
            value={defaultDownloadPath}
            onChange={(event) => setDefaultDownloadPath(event.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn btn-outline" type="button" onClick={() => void handleSelectDefaultPath()}>
            Escolher pasta
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void handleSaveDefaultPath()}>
            Salvar
          </button>
        </div>
        {savePathError ? <p className="error">{savePathError}</p> : null}
        <p className="small-note">Ao clicar em Baixar, o app usa esta pasta automaticamente.</p>
      </article>

      <article className="glass-card">
        <header className="card-header">
          <h2>Fontes Hydra</h2>
          <span className="card-meta">{sources.length} fontes</span>
        </header>
        <form onSubmit={handleAddSource} className="source-form source-form--single">
          <input
            placeholder="URL da fonte (.json)"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!canSubmitSource}>
            Adicionar
          </button>
        </form>
        {sourcesLoading ? <p>Carregando fontes...</p> : null}
        {sourcesError ? <p className="error">{sourcesError}</p> : null}

        <ul className="sources-list">
          {sources.map((source) => (
            <li key={source.id}>
              <div>
                <strong>{source.name}</strong>
                <span>{source.url}</span>
                <span>Status: {source.status}</span>
                <span>Downloads: {source.downloadCount}</span>
              </div>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => void dispatch(deleteSource(source.id))}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>

        {!sourcesLoading && sources.length === 0 ? (
          <p className="empty-message">Nenhuma fonte configurada ainda.</p>
        ) : null}
      </article>
    </>
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo">H</span>
          <div>
            <strong>Hydra Launcher</strong>
            <p>Interface híbrida Steam + Epic</p>
          </div>
        </div>
        <nav className="topbar-tabs">
          {(Object.keys(TAB_LABEL) as NavTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`topbar-tab ${tab === activeTab ? 'topbar-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="hero-eyebrow">{TAB_LABEL[activeTab]}</span>
          <h1>Seu hub de jogos</h1>
          <p>Descubra, baixe e organize sua biblioteca com um fluxo único.</p>
        </div>
        <div className="hero-kpis">
          <article className="metric-card">
            <span>Fontes ativas</span>
            <strong>{sources.length}</strong>
          </article>
          <article className="metric-card">
            <span>Downloads ativos</span>
            <div className="metric-card__with-progress">
              <strong>{activeJobs.length}</strong>
              <div
                className="progress-circle"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={currentProgress}
                style={{ '--progress': `${currentProgress}` } as Record<string, string>}
              >
                <span>{currentProgress}%</span>
              </div>
            </div>
          </article>
          <article className="metric-card">
            <span>Na biblioteca</span>
            <strong>{completedJobs.length}</strong>
          </article>
        </div>
      </section>

      <section className="layout-grid">
        <aside className="left-rail">
          <article className="glass-card">
            <header className="card-header">
              <h2>Biblioteca</h2>
            </header>
            <ul className="library-list">
              {libraryItems.slice(0, 8).map((item) => (
                <li key={item.id} className="library-item">
                  <div className="library-item__main">
                    <strong>{item.title}</strong>
                    <span>
                      {formatSize(item.totalBytes > 0 ? item.totalBytes : item.bytesDownloaded)} • {Math.round(item.progress)}%
                    </span>
                  </div>
                  <span className={`badge badge-${item.status}`}>{formatStatusLabel(item.status)}</span>
                </li>
              ))}
            </ul>
            {libraryItems.length === 0 ? (
              <p className="empty-message">Sem jogos na biblioteca ainda.</p>
            ) : null}
          </article>

          <article className="glass-card">
            <header className="card-header">
              <h2>Atalhos</h2>
            </header>
            <div className="shortcut-list">
              <button className="btn btn-outline" type="button" onClick={() => setActiveTab('discover')}>
                Ir para Descobrir
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setActiveTab('downloads')}>
                Abrir Downloads
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setActiveTab('settings')}>
                Abrir Configurações
              </button>
            </div>
          </article>
        </aside>

        <section className="main-content">{renderMainContent()}</section>
      </section>
    </main>
  )
}

export default App
