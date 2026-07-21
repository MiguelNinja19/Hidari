export type LibraryPathState = {
  /** @deprecated use hasGame — mantido para compatibilidade */
  playable: boolean
  hasGame: boolean
  needsInstall: boolean
  installPath?: string | null
  needsExtraction: boolean
  customGameRoot?: string | null
  /** .exe jogável já encontrado na inspeção (acelera o 1.º Jogar) */
  launchPath?: string | null
}

export type InspectLibraryPathInput = {
  key: string
  title: string
  path: string
  jobId?: string
}

export type InspectLibraryPathResult = {
  key: string
  state: LibraryPathState
}

export type LocalLibraryItem = {
  name: string
  path: string
  isDir: boolean
  sizeBytes: number
  modifiedAt: number
  /** Importado pelo utilizador (não veio do download Hidari). */
  external?: boolean
}
