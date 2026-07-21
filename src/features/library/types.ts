import type { DownloadJob } from '../../shared/types/contracts'

export type LibraryEntry = {
  id: string
  title: string
  status: string
  destPath: string
  kind: 'job' | 'folder'
  /** Importado via «Adicionar jogo» (atalho/pasta externa). */
  external?: boolean
  job?: DownloadJob
}
