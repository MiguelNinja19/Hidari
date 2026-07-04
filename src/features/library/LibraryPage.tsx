import { CatalogCover } from '../../shared/components/CatalogCover'
import { Button } from '../../shared/components/ui/Button'
import type { DownloadJob, LibraryPathState } from '../../shared/types/contracts'
import type { ResolvedCover } from '../covers/useGameCovers'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import { resolveDeletePath } from '../../shared/utils/archive'
import type { LibraryEntry } from './types'

type LibraryPageProps = {
  libraryItems: LibraryEntry[]
  jobs: DownloadJob[]
  pathStateByKey: Record<string, LibraryPathState>
  libraryFilter: string
  libraryStatusFilter: 'all' | 'installed' | 'not_installed'
  playBusyId: string | null
  installBusyId: string | null
  savePathError: string
  actionMessage: string
  setLibraryFilter: (value: string) => void
  setLibraryStatusFilter: (value: 'all' | 'installed' | 'not_installed') => void
  setActiveTabDownloads: () => void
  onGoDiscover: () => void
  resolveCover: (title: string, catalogCoverUrl?: string | null) => ResolvedCover
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void
  libraryStatusMeta: (
    item: LibraryEntry,
    jobs: DownloadJob[],
    pathStateByKey: Record<string, LibraryPathState>,
  ) => { label: string; tone: string }
  showPlayAction: (
    item: LibraryEntry,
    jobs: DownloadJob[],
    pathStateByKey: Record<string, LibraryPathState>,
  ) => boolean
  showInstallAction: (
    item: LibraryEntry,
    jobs: DownloadJob[],
    pathStateByKey: Record<string, LibraryPathState>,
  ) => boolean
  showLocateInstallAction: (
    item: LibraryEntry,
    jobs: DownloadJob[],
    pathStateByKey: Record<string, LibraryPathState>,
  ) => boolean
  hasManualInstallRoot: (
    item: LibraryEntry,
    pathStateByKey: Record<string, LibraryPathState>,
  ) => boolean
  isLibraryInstalled: (item: LibraryEntry) => boolean
  handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
  handleInstallItem: (item: LibraryEntry) => Promise<void>
  handlePickGameInstallFolder: (
    title: string,
    destPath: string,
    busyKey: string,
    jobId?: string,
  ) => Promise<void>
  handleDeleteLibraryItem: (item: LibraryEntry) => Promise<void>
  onResumeItem: (id: string) => Promise<void>
  onOpenLocalPath: (path: string) => Promise<void>
}

type LibraryAction = {
  id: string
  label: string
  title?: string
  variant?: 'primary' | 'outline' | 'danger'
  disabled?: boolean
  onClick: () => void
}

const STATUS_SHORT: Record<string, string> = {
  ready: 'Jogar',
  waiting: 'Instalar',
  downloading: 'A baixar',
  extracting: 'A extrair',
  paused: 'Pausado',
  idle: 'Na fila',
  failed: 'Erro',
}

function busyKey(item: LibraryEntry) {
  return item.kind === 'job' ? item.id : item.destPath
}

function itemPathStateKey(item: LibraryEntry): string {
  if (item.kind === 'job') return `job:${item.id}`
  const base = resolveDeletePath(item.destPath).toLowerCase()
  return `${base}::${item.title.trim().toLowerCase()}`
}

function buildLibraryActions(
  item: LibraryEntry,
  ctx: {
    key: string
    canPlay: boolean
    canInstall: boolean
    canLocate: boolean
    canDelete: boolean
    needsExtraction: boolean
    playBusyId: string | null
    installBusyId: string | null
    handlePlayLibraryItem: (item: LibraryEntry) => Promise<void>
    handleInstallItem: (item: LibraryEntry) => Promise<void>
    handlePickGameInstallFolder: LibraryPageProps['handlePickGameInstallFolder']
    handleDeleteLibraryItem: (item: LibraryEntry) => Promise<void>
    onResumeItem: (id: string) => Promise<void>
    onOpenLocalPath: (path: string) => Promise<void>
    setActiveTabDownloads: () => void
  },
): { primary: LibraryAction | null; secondary: LibraryAction[] } {
  const secondary: LibraryAction[] = []

  const addOpenFolder = () => {
    secondary.push({
      id: 'open',
      label: 'Pasta',
      title: 'Abrir pasta de download',
      variant: 'outline',
      onClick: () => void ctx.onOpenLocalPath(item.destPath),
    })
  }

  const addLocate = () => {
    secondary.push({
      id: 'locate',
      label: 'Indicar',
      title: 'Indicar onde instalou o jogo',
      variant: 'outline',
      disabled: ctx.installBusyId === ctx.key,
      onClick: () =>
        void ctx.handlePickGameInstallFolder(
          item.title,
          item.destPath,
          ctx.key,
          item.kind === 'job' ? item.id : undefined,
        ),
    })
  }

  const addDelete = () => {
    secondary.push({
      id: 'delete',
      label: 'Apagar',
      title: 'Apagar da biblioteca',
      variant: 'danger',
      onClick: () => void ctx.handleDeleteLibraryItem(item),
    })
  }

  if (ctx.canInstall) {
    addOpenFolder()
    if (ctx.canLocate) addLocate()
    if (ctx.canDelete) addDelete()
    return {
      primary: {
        id: 'install',
        label:
          ctx.installBusyId === ctx.key
            ? 'A abrir…'
            : ctx.needsExtraction
              ? 'Preparar'
              : 'Instalar',
        title: ctx.needsExtraction
          ? 'Extrair ficheiros antes de instalar'
          : 'Abrir o instalador do jogo',
        variant: 'primary',
        disabled: ctx.installBusyId === ctx.key,
        onClick: () => void ctx.handleInstallItem(item),
      },
      secondary,
    }
  }

  if (ctx.canPlay) {
    addOpenFolder()
    if (ctx.canDelete) addDelete()
    return {
      primary: {
        id: 'play',
        label: ctx.playBusyId === ctx.key ? 'A iniciar…' : 'Jogar',
        title: 'Iniciar o jogo',
        variant: 'primary',
        disabled: ctx.playBusyId === ctx.key,
        onClick: () => void ctx.handlePlayLibraryItem(item),
      },
      secondary,
    }
  }

  if (
    item.kind === 'job' &&
    ['downloading', 'pending', 'retrying', 'extracting'].includes(item.status)
  ) {
    addOpenFolder()
    return {
      primary: {
        id: 'queue',
        label: 'Ver download',
        title: 'Ir para a fila de downloads',
        variant: 'primary',
        onClick: ctx.setActiveTabDownloads,
      },
      secondary,
    }
  }

  if (item.kind === 'job' && (item.status === 'paused' || item.status === 'failed')) {
    addOpenFolder()
    return {
      primary: {
        id: 'resume',
        label: 'Retomar download',
        title: 'Continuar o download',
        variant: 'primary',
        onClick: () => void ctx.onResumeItem(item.id),
      },
      secondary,
    }
  }

  if (ctx.canLocate) {
    addOpenFolder()
    if (ctx.canDelete) addDelete()
    return {
      primary: {
        id: 'locate-primary',
        label: ctx.installBusyId === ctx.key ? 'A abrir…' : 'Indicar pasta',
        title: 'Escolher a pasta onde o jogo foi instalado',
        variant: 'primary',
        disabled: ctx.installBusyId === ctx.key,
        onClick: () =>
          void ctx.handlePickGameInstallFolder(
            item.title,
            item.destPath,
            ctx.key,
            item.kind === 'job' ? item.id : undefined,
          ),
      },
      secondary,
    }
  }

  addOpenFolder()
  if (ctx.canDelete) addDelete()
  return {
    primary: {
      id: 'open-primary',
      label: 'Abrir pasta',
      title: 'Abrir pasta no explorador',
      variant: 'outline',
      onClick: () => void ctx.onOpenLocalPath(item.destPath),
    },
    secondary: secondary.filter((action) => action.id !== 'open'),
  }
}

export function LibraryPage({
  libraryItems,
  jobs,
  pathStateByKey,
  libraryFilter,
  libraryStatusFilter,
  playBusyId,
  installBusyId,
  savePathError,
  actionMessage,
  setLibraryFilter,
  setLibraryStatusFilter,
  setActiveTabDownloads,
  onGoDiscover,
  resolveCover,
  invalidateLocalCover,
  libraryStatusMeta,
  showPlayAction,
  showInstallAction,
  showLocateInstallAction,
  hasManualInstallRoot,
  isLibraryInstalled,
  handlePlayLibraryItem,
  handleInstallItem,
  handlePickGameInstallFolder,
  handleDeleteLibraryItem,
  onResumeItem,
  onOpenLocalPath,
}: LibraryPageProps) {
  const hasActiveFilter =
    libraryFilter.trim().length > 0 || libraryStatusFilter !== 'all'

  return (
    <section className="library-page">
      <header className="page-toolbar">
        <div className="browse-search browse-search--bar">
          <span className="browse-search__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
          </span>
          <input
            className="browse-search__input"
            type="search"
            placeholder="Filtrar…"
            value={libraryFilter}
            onChange={(event) => setLibraryFilter(event.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="page-toolbar__filters" role="tablist" aria-label="Filtrar">
          {(
            [
              ['all', 'Todos'],
              ['installed', 'Prontos'],
              ['not_installed', 'Em curso'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              className={`chip${libraryStatusFilter === value ? ' chip--active' : ''}`}
              aria-selected={libraryStatusFilter === value}
              onClick={() => setLibraryStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {savePathError ? <p className="browse-note browse-note--error">{savePathError}</p> : null}
      {actionMessage ? <p className="browse-note">{actionMessage}</p> : null}

      {libraryItems.length > 0 ? (
        <ul className="library-grid">
          {libraryItems.map((item) => {
            const status = libraryStatusMeta(item, jobs, pathStateByKey)
            const cover = resolveCover(item.title)
            const key = busyKey(item)
            const canPlay = showPlayAction(item, jobs, pathStateByKey)
            const canInstall = showInstallAction(item, jobs, pathStateByKey)
            const canLocate = showLocateInstallAction(item, jobs, pathStateByKey)
            const canDelete = isLibraryInstalled(item) || item.kind === 'folder'
            const manualRoot = hasManualInstallRoot(item, pathStateByKey)
            const statusShort = STATUS_SHORT[status.tone] ?? status.label
            const pathState = pathStateByKey[itemPathStateKey(item)]
            const needsExtraction = pathState?.needsExtraction === true

            const { primary, secondary } = buildLibraryActions(item, {
              key,
              canPlay,
              canInstall,
              canLocate,
              canDelete,
              needsExtraction,
              playBusyId,
              installBusyId,
              handlePlayLibraryItem,
              handleInstallItem,
              handlePickGameInstallFolder,
              handleDeleteLibraryItem,
              onResumeItem,
              onOpenLocalPath,
              setActiveTabDownloads,
            })

            return (
              <li
                key={item.id}
                className="library-card"
                title={[status.label, manualRoot ? 'Pasta apontada manualmente' : '']
                  .filter(Boolean)
                  .join(' · ')}
              >
                <div className="library-card__cover">
                  <CatalogCover
                    title={item.title}
                    coverUrl={cover.coverUrl}
                    localPath={cover.localPath}
                    cached={cover.status === 'cached'}
                    status={cover.status}
                    onLocalCoverError={() => invalidateLocalCover(item.title, cover.coverUrl)}
                  />
                  <span className={`library-card__badge library-card__badge--${status.tone}`}>
                    {statusShort}
                  </span>
                </div>

                <div className="library-card__foot">
                  <h3 className="library-card__title" title={item.title}>
                    {cleanTitleForDisplay(item.title)}
                  </h3>

                  <div className="library-card__actions">
                    {primary ? (
                      <Button
                        variant={primary.variant ?? 'primary'}
                        size="compact"
                        className={`library-card__cta${
                          primary.id === 'install' ? ' library-card__cta--install' : ''
                        }`}
                        type="button"
                        title={primary.title}
                        disabled={primary.disabled}
                        onClick={primary.onClick}
                      >
                        {primary.label}
                      </Button>
                    ) : null}

                    {secondary.length > 0 ? (
                      <div className="library-card__toolbar" role="group" aria-label="Mais ações">
                        {secondary.map((action) => (
                          <Button
                            key={action.id}
                            variant={action.variant ?? 'outline'}
                            size="compact"
                            className="library-card__tool"
                            type="button"
                            title={action.title ?? action.label}
                            disabled={action.disabled}
                            onClick={action.onClick}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="browse-idle">
          <p className="browse-idle__text">{hasActiveFilter ? 'Sem resultados.' : 'Vazio.'}</p>
          <button
            className="btn btn-outline btn--compact"
            type="button"
            onClick={() => {
              if (hasActiveFilter) {
                setLibraryFilter('')
                setLibraryStatusFilter('all')
                return
              }
              onGoDiscover()
            }}
          >
            {hasActiveFilter ? 'Limpar' : 'Explorar'}
          </button>
        </div>
      )}
    </section>
  )
}
