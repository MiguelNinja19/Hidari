import type { Source } from '../../shared/types/contracts'

export type SourcesState = {
  items: Source[]
  loading: boolean
  error: string | null
  notice: string | null
}

export const initialSourcesState: SourcesState = {
  items: [],
  loading: false,
  error: null,
  notice: null,
}
