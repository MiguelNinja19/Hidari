import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { addSource, deleteSource, fetchSources } from './features/sources/sourcesSlice'
import {
  cancelJob,
  clearCompletedJobs,
  enqueueJob,
  fetchJobs,
  pauseJob,
  resumeJob,
} from './features/queue/queueSlice'
import { sourcesApi } from './shared/api/tauri/sourcesApi'
import type { DownloadOption } from './shared/types/contracts'
import './App.css'

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

  useEffect(() => {
    void dispatch(fetchSources())
    void sourcesApi.syncSources().then(() => dispatch(fetchSources()))
    void dispatch(fetchJobs())

    const polling = window.setInterval(() => {
      void dispatch(fetchJobs())
    }, 2000)

    void sourcesApi.getDefaultDownloadPath().then((path) => {
      if (path) setDefaultDownloadPath(path)
    })

    return () => {
      window.clearInterval(polling)
    }
  }, [dispatch])

  const canSubmitSource = useMemo(
    () => sourceUrl.trim().length > 0,
    [sourceUrl],
  )

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmitSource) {
      return
    }
    void dispatch(
      addSource({
        url: sourceUrl.trim(),
      }),
    )
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
    } catch (error) {
      setSavePathError(error instanceof Error ? error.message : 'Falha ao salvar pasta padrão.')
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
    }
  }

  const activeJobs = jobs.filter((job) => job.status === 'downloading' || job.status === 'pending' || job.status === 'paused')
  const completedJobs = jobs.filter((job) => job.status === 'completed')

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <h1>Hydra Launcher</h1>
          <p>Pesquise jogos nas fontes e baixe com um clique.</p>
        </div>
      </section>

      <section className="stats-grid">
        <article className="metric-card">
          <span>Fontes ativas</span>
          <strong>{sources.length}</strong>
        </article>
        <article className="metric-card">
          <span>Resultados atuais</span>
          <strong>{searchResults.length}</strong>
        </article>
        <article className="metric-card">
          <span>Downloads ativos</span>
          <strong>{activeJobs.length}</strong>
        </article>
        <article className="metric-card">
          <span>Concluídos</span>
          <strong>{completedJobs.length}</strong>
        </article>
      </section>

      <section className="content-grid">
        <section className="main-column">
          <article className="glass-card">
            <header className="card-header">
              <h2>Buscar nas fontes</h2>
            </header>
            <form onSubmit={handleSearch} className="source-form source-form--single">
              <input
                placeholder="Ex.: Devil May Cry"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button type="submit" disabled={searchQuery.trim().length < 2}>
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {searching ? <p>Buscando nas fontes Hydra...</p> : null}
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
                    <span>{option.url}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void dispatch(
                        enqueueJob({
                          title: option.title,
                          url: option.url,
                        }),
                      )
                    }}
                  >
                    Baixar
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="glass-card">
            <header className="card-header">
              <h2>Fila de downloads</h2>
            </header>
            {queueLoading ? <p>Carregando fila...</p> : null}
            {queueError ? <p className="error">{queueError}</p> : null}

            {jobs.length > 0 && (
              <button
                type="button"
                className="btn-small"
                onClick={() => void dispatch(clearCompletedJobs())}
              >
                Limpar concluídos / cancelados
              </button>
            )}

            <ul className="job-list">
              {jobs.map((job) => (
                <li key={job.id} className="job-item">
                  <div className="job-header">
                    <strong>{job.title}</strong>
                    <span className={`badge badge-${job.status}`}>{job.status}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                  <div className="job-meta">
                    <span>{job.progress}%</span>
                    <span className="job-url">
                      {job.url.length > 50 ? `${job.url.slice(0, 50)}…` : job.url}
                    </span>
                  </div>
                  <div className="actions">
                    {(job.status === 'downloading' || job.status === 'pending') && (
                      <button type="button" onClick={() => void dispatch(pauseJob(job.id))}>
                        Pausar
                      </button>
                    )}
                    {job.status === 'paused' && (
                      <button type="button" onClick={() => void dispatch(resumeJob(job.id))}>
                        Retomar
                      </button>
                    )}
                    {job.status !== 'completed' && job.status !== 'cancelled' && (
                      <button type="button" onClick={() => void dispatch(cancelJob(job.id))}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <aside className="sidebar-column">
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
              <button type="button" onClick={() => void handleSelectDefaultPath()}>
                Escolher pasta
              </button>
              <button type="button" onClick={() => void handleSaveDefaultPath()}>
                Salvar
              </button>
            </div>
            {savePathError ? <p className="error">{savePathError}</p> : null}
            <p className="small-note">
              Ao clicar em Baixar, o app usa esta pasta automaticamente.
            </p>
          </article>

          <article className="glass-card">
            <header className="card-header">
              <h2>Fontes Hydra</h2>
            </header>
            <form onSubmit={handleAddSource} className="source-form source-form--single">
              <input
                placeholder="URL da fonte (.json)"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
              <button type="submit" disabled={!canSubmitSource}>
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
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => {
                        void dispatch(deleteSource(source.id))
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </main>
  )
}

export default App
