import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import { buildLibraryFileActions } from './libraryTileFileActions'
import { buildLibraryMenuActions } from './libraryTileMenuActions'
import type { LibraryTileActionContext } from './libraryTileActionContext'

export function buildLibrarySecondaryActions(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
): GameTileAction[] {
  return [...buildLibraryMenuActions(item, t, ctx), ...buildLibraryFileActions(item, t, ctx)]
}

export { libraryBusyKey, type LibraryTileActionContext } from './libraryTileActionContext'
