import type { TFunction } from 'i18next'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryEntry } from './types'
import {
  buildLibrarySecondaryActions,
  type LibraryTileActionContext,
} from './libraryTileSecondaryActions'
import { buildLibraryPrimaryAction } from './libraryTilePrimaryAction'

export function buildLibraryTileActions(
  item: LibraryEntry,
  t: TFunction,
  ctx: LibraryTileActionContext,
): { primary: GameTileAction | null; secondary: GameTileAction[] } {
  const secondary = buildLibrarySecondaryActions(item, t, ctx)
  return buildLibraryPrimaryAction(item, t, ctx, secondary)
}

export { libraryBusyKey, type LibraryTileActionContext } from './libraryTileSecondaryActions'
