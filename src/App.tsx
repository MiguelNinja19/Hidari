import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { appApi } from './shared/api/tauri/appApi'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { addSource, deleteSource, fetchSources } from './features/sources/sourcesSlice'
import { progressReceived, startMockDownload } from './features/downloads/downloadsSlice'
import {
  addGame,
  fetchGames,
  removeGame,
  toggleGameFavorite,
  updateGame,
} from './features/library/librarySlice'
import {
  cancelJob,
  clearCompletedJobs,
  enqueueJob,
  fetchJobs,
  jobProgressReceived,
  pauseJob,
  resumeJob,
} from './features/queue/queueSlice'
import {
  createCollection,
  deleteCollection,
  fetchCollections,
} from './features/collections/collectionsSlice'
import { tauriClient } from './shared/api/tauri/client'
import './App.css'

function App() {
  const dispatch = useAppDispatch()
  const sources = useAppSelector((state) => state.sources.items)
  const sourcesLoading = useAppSelector((state) => state.sources.loading)
  const sourcesError = useAppSelector((state) => state.sources.error)
  const download = useAppSelector((state) => state.downloads.current)
  const downloadRunning = useAppSelector((state) => state.downloads.running)
  const games = useAppSelector((state) => state.library.items)
  const gamesLoading = useAppSelector((state) => state.library.loading)
  const jobs = useAppSelector((state) => state.queue.jobs)
  const queueLoading = useAppSelector((state) => state.queue.loading)
  const queueError = useAppSelector((state) => state.queue.error)
  const collections = useAppSelector((state) => state.collections.items)

  const [ping, setPing] = useState<string>('')
  const [version, setVersion] = useState<string>('')
  const [paths, setPaths] = useState<string>('')
  const [sourceName, setSourceName] = useState<string>('')
  const [sourceUrl, setSourceUrl] = useState<string>('')
  const [gameTitle, setGameTitle] = useState<string>('')
  const [gamePath, setGamePath] = useState<string>('')
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [jobTitle, setJobTitle] = useState<string>('')
  const [jobUrl, setJobUrl] = useState<string>('')
  const [jobDestPath, setJobDestPath] = useState<string>('')
  const [newCollectionName, setNewCollectionName] = useState<string>('')
  const [deepLinkInfo, setDeepLinkInfo] = useState<string>('')

  useEffect(() => {
    void dispatch(fetchSources())
    void dispatch(fetchGames())
    void dispatch(fetchJobs())
    void dispatch(fetchCollections())

    void appApi.ping().then(setPing)
    void appApi.appVersion().then(setVersion)
    void appApi.getPaths().then((appPaths) => {
      setPaths(appPaths.appDataDir)
    })

    let unlistenProgress: (() => void) | undefined
    let unlistenJobProgress: (() => void) | undefined
    let unlistenDeepLink: (() => void) | undefined

    void tauriClient
      .listenDownloadProgress((event) => {
        dispatch(progressReceived(event))
      })
      .then((unsubscribe) => {
        unlistenProgress = unsubscribe
      })

    void tauriClient
      .listenJobProgress((event) => {
        dispatch(jobProgressReceived(event))
      })
      .then((unsubscribe) => {
        unlistenJobProgress = unsubscribe
      })

    void tauriClient
      .listenDeepLink((event) => {
        const action = event.action ?? 'unknown'
        const gameId = event.gameId ?? '-'
        setDeepLinkInfo(`action=${action} gameId=${gameId}`)
      })
      .then((unsubscribe) => {
        unlistenDeepLink = unsubscribe
      })

    return () => {
      if (unlistenProgress) unlistenProgress()
      if (unlistenJobProgress) unlistenJobProgress()
      if (unlistenDeepLink) unlistenDeepLink()
    }
  }, [dispatch])

  const handleEnqueueJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = jobTitle.trim()
    const url = jobUrl.trim()
    const destPath = jobDestPath.trim()
    if (!title || !url || !destPath) return
    void dispatch(enqueueJob({ title, url, destPath }))
    setJobTitle('')
    setJobUrl('')
    setJobDestPath('')
  }

  const canSubmitSource = useMemo(
    () => sourceName.trim().length > 0 && sourceUrl.trim().length > 0,
    [sourceName, sourceUrl],
  )

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmitSource) {
      return
    }
    void dispatch(
      addSource({
        name: sourceName.trim(),
        baseUrl: sourceUrl.trim(),
      }),
    )
    setSourceName('')
    setSourceUrl('')
  }

  const handleSaveGame = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = gameTitle.trim()
    const installPath = gamePath.trim()
    if (!title || !installPath) {
      return
    }

    if (editingGameId) {
      void dispatch(updateGame({ id: editingGameId, title, installPath }))
      setEditingGameId(null)
    } else {
      void dispatch(addGame({ title, installPath }))
    }
    setGameTitle('')
    setGamePath('')
  }

  return (
    <main className="container">
      <h1>MyLauncher - MVP Tauri</h1>
      <section className="card">
        <h2>Comandos básicos</h2>
        <p>
          Ping: <strong>{ping || '...'}</strong>
        </p>
        <p>
          Versão: <strong>{version || '...'}</strong>
        </p>
        <p>
          Pasta de dados: <code>{paths || '...'}</code>
        </p>
        <p>
          Deep link atual: <strong>{deepLinkInfo || 'nenhum'}</strong>
        </p>
        <button
          type="button"
          onClick={() => {
            void tauriClient.invoke('open_deep_link', {
              url: `mylauncher://run?gameId=${games[0]?.id ?? 1}`,
            })
          }}
        >
          Testar deep link
        </button>
      </section>

      <section className="card">
        <h2>Fila de downloads</h2>
        <form onSubmit={handleEnqueueJob} className="job-form">
          <input
            placeholder="Título"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
          <input
            placeholder="URL (http/https/magnet)"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
          <input
            placeholder="Pasta de destino"
            value={jobDestPath}
            onChange={(e) => setJobDestPath(e.target.value)}
          />
          <button
            type="submit"
            disabled={!jobTitle.trim() || !jobUrl.trim() || !jobDestPath.trim()}
          >
            Enfileirar
          </button>
        </form>

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
      </section>

      <section className="card">
        <h2>Coleções de jogos</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const name = newCollectionName.trim()
            if (!name) return
            void dispatch(createCollection(name))
            setNewCollectionName('')
          }}
          className="source-form"
        >
          <input
            placeholder="Nome da coleção"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            style={{ gridColumn: '1 / -2' }}
          />
          <button type="submit" disabled={!newCollectionName.trim()}>
            Criar
          </button>
        </form>
        <ul className="sources-list">
          {collections.map((col) => (
            <li key={col.id}>
              <div>
                <strong>{col.name}</strong>
                <span>{col.gameCount} jogo{col.gameCount !== 1 ? 's' : ''}</span>
              </div>
              <button
                type="button"
                onClick={() => void dispatch(deleteCollection(col.id))}
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Biblioteca de jogos</h2>
        <form onSubmit={handleSaveGame} className="source-form">
          <input
            placeholder="Título do jogo"
            value={gameTitle}
            onChange={(event) => setGameTitle(event.target.value)}
          />
          <input
            placeholder="Pasta de instalação"
            value={gamePath}
            onChange={(event) => setGamePath(event.target.value)}
          />
          <button type="submit">{editingGameId ? 'Salvar' : 'Adicionar jogo'}</button>
        </form>

        {gamesLoading ? <p>Carregando jogos...</p> : null}
        <ul className="sources-list">
          {games.map((game) => (
            <li key={game.id}>
              <div>
                <strong>{game.title}</strong>
                <span>{game.installPath}</span>
                <span>{game.isFavorite ? 'Favorito' : 'Normal'}</span>
              </div>
              <div className="actions">
                <button
                  type="button"
                  onClick={() => {
                    void dispatch(toggleGameFavorite({ id: game.id, favorite: !game.isFavorite }))
                  }}
                >
                  {game.isFavorite ? 'Desfavoritar' : 'Favoritar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGameId(game.id)
                    setGameTitle(game.title)
                    setGamePath(game.installPath)
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void dispatch(removeGame(game.id))
                  }}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Fontes de download</h2>
        <form onSubmit={handleAddSource} className="source-form">
          <input
            placeholder="Nome da fonte"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
          />
          <input
            placeholder="URL base (https://...)"
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
                <span>{source.baseUrl}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void dispatch(deleteSource(source.id))
                }}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Download mock</h2>
        <button
          type="button"
          disabled={downloadRunning}
          onClick={() => {
            void dispatch(startMockDownload(`download-${Date.now()}`))
          }}
        >
          Iniciar download mock
        </button>
        <div className="progress">
          <p>
            Status: <strong>{download?.status ?? 'idle'}</strong>
          </p>
          <p>
            Progresso: <strong>{download?.progress ?? 0}%</strong>
          </p>
          <p>
            Velocidade: <strong>{download?.speedBytesPerSec ?? 0} B/s</strong>
          </p>
          <p>
            ETA: <strong>{download?.etaSeconds ?? 0}s</strong>
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
