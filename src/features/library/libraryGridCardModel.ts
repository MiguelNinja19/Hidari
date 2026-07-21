import type { AppLanguage } from '../../shared/config/locale'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryStatusMeta } from './libraryItemState'
import type { LibraryEntry } from './types'

export type LibraryGridCardModel = {
  item: LibraryEntry
  statusMeta: LibraryStatusMeta
  primary: GameTileAction | null
  secondary: GameTileAction[]
  isDeleting: boolean
  manualRoot: boolean
  language: AppLanguage
}
