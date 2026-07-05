import { CatalogCover } from '../../shared/components/CatalogCover'
import { GameTile, type GameTileAction } from '../../shared/components/GameTile'
import { PageNotice } from '../../shared/components/PageNotice'
import { SearchInput } from '../../shared/components/ui/SearchInput'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import { resolveDeletePath } from '../../shared/utils/archive'
import type { LibraryEntry } from './types'
import {
  useLibraryController,
  useLibraryItemHelpers,
  useLibraryResumeItem,
  useOpenLocalPath,
} from './LibraryController'
import type { LibraryControllerValue } from './LibraryController'

type LibraryAction = GameTileAction
function libraryStatusLine(
  status: { label: string; tone: string },
  primary: LibraryAction | null,
): string | null {
  if (status.tone === 'ready' || status.tone === 'waiting') return null
  if (primary?.id === 'play' || primary?.id === 'install') return null
  return status.label
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
    handleExtractItem: (item: LibraryEntry) => Promise<void>
    handlePickGameInstallFolder: LibraryControllerValue['handlePickGameInstallFolder']
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
      label: 'Localizar',
      title: 'Indicar onde o jogo foi instalado',
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
      label: 'Excluir',
      title: 'Excluir da biblioteca',
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
            ? 'Abrindo…'
            : ctx.needsExtraction
              ? 'Preparar'
              : 'Instalar',
        title: ctx.needsExtraction
          ? 'Extrair arquivos antes de instalar'
          : 'Abrir o instalador do jogo',
        variant: 'primary',
        disabled: ctx.installBusyId === ctx.key,
        onClick: () =>
          void (ctx.needsExtraction ? ctx.handleExtractItem(item) : ctx.handleInstallItem(item)),
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
        label: ctx.playBusyId === ctx.key ? 'Iniciando…' : 'Jogar',
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
        label: ctx.installBusyId === ctx.key ? 'Abrindo…' : 'Localizar pasta',
        title: 'Selecionar a pasta onde o jogo foi instalado',
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
      title: 'Abrir pasta no Explorer',
      variant: 'outline',
      onClick: () => void ctx.onOpenLocalPath(item.destPath),
    },
    secondary: secondary.filter((action) => action.id !== 'open'),
  }
}

export function LibraryPage() {
  const {
    libraryItems,
    pathStateByKey,
    libraryFilter,
    libraryStatusFilter,
    playBusyId,
    installBusyId,
    savePathError,
    actionMessage,
    setLibraryFilter,
    setLibraryStatusFilter,
    onGoDownloads,
    resolveCover,
    invalidateLocalCover,
    handlePlayLibraryItem,
    handleInstallItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handleDeleteLibraryItem,
  } = useLibraryController()
  const {
    libraryStatusMeta,
    showPlayAction,
    showInstallAction,
    showLocateInstallAction,
    hasManualInstallRoot,
    isLibraryInstalled,
  } = useLibraryItemHelpers()
  const onResumeItem = useLibraryResumeItem()
  const onOpenLocalPath = useOpenLocalPath()

  return (
    <section className="library-page">
      <header className="library-toolbar">
        <SearchInput
          className="library-toolbar__search browse-search browse-search--bar"
          value={libraryFilter}
          placeholder="Filtrar biblioteca…"
          onChange={setLibraryFilter}
        />        <div className="library-toolbar__filters" role="tablist" aria-label="Filtrar biblioteca">
          {(
            [
              ['all', 'Todos'],
              ['installed', 'Instalados'],
              ['not_installed', 'Em andamento'],
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

      {(savePathError?.trim() || actionMessage?.trim()) ? (
        <PageNotice
          error={savePathError?.trim() || null}
          message={actionMessage?.trim() || null}
        />
      ) : null}

      {libraryItems.length > 0 ? (
        <ul className="library-grid">
          {libraryItems.map((item) => {
            const status = libraryStatusMeta(item)
            const cover = resolveCover(item.title)
            const key = busyKey(item)
            const canPlay = showPlayAction(item)
            const canInstall = showInstallAction(item)
            const canLocate = showLocateInstallAction(item)
            const canDelete = isLibraryInstalled(item) || item.kind === 'folder'
            const manualRoot = hasManualInstallRoot(item)
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
              handleExtractItem,
              handlePickGameInstallFolder,
              handleDeleteLibraryItem,
              onResumeItem,
              onOpenLocalPath,
              setActiveTabDownloads: onGoDownloads,
            })

            const statusLine = libraryStatusLine(status, primary)

            return (
              <li key={item.id}>
                <GameTile
                  title={cleanTitleForDisplay(item.title)}
                  titleAttr={[status.label, manualRoot ? 'Pasta indicada manualmente' : '']
                    .filter(Boolean)
                    .join(' · ')}
                  cover={
                    <CatalogCover
                      title={item.title}
                      coverUrl={cover.coverUrl}
                      localPath={cover.localPath}
                      cached={cover.status === 'cached'}
                      status={cover.status}
                      onLocalCoverError={() => invalidateLocalCover(item.title, cover.coverUrl)}
                    />
                  }
                  primaryAction={primary}
                  secondaryActions={secondary}
                  statusLine={statusLine}
                />
              </li>
            )          })}
        </ul>
      ) : null}
    </section>
  )
}
