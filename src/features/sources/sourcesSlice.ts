import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { APP_LOCALE } from '../../shared/config/locale'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type {
  AddSourceInput,
  Source,
} from '../../shared/types/contracts'

type SourcesState = {
  items: Source[]
  loading: boolean
  error: string | null
  notice: string | null
}

const initialState: SourcesState = {
  items: [],
  loading: false,
  error: null,
  notice: null,
}

export const fetchSources = createAsyncThunk('sources/fetch', async () =>
  sourcesApi.listSources(),
)

export const addSource = createAsyncThunk(
  'sources/add',
  async (payload: AddSourceInput) => sourcesApi.addSource(payload),
)

export const deleteSource = createAsyncThunk(
  'sources/delete',
  async (sourceId: string) => {
    await sourcesApi.removeSource(sourceId)
    return sourceId
  },
)

export const syncSource = createAsyncThunk(
  'sources/syncOne',
  async (sourceId: string) => sourcesApi.syncLocalSource(sourceId),
)

export const syncAllSources = createAsyncThunk(
  'sources/syncAll',
  async () => sourcesApi.syncAllLocalSources(),
)

const sourcesSlice = createSlice({
  name: 'sources',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSources.pending, (state) => {
        state.loading = true
        state.error = null
        state.notice = null
      })
      .addCase(fetchSources.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchSources.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Erro ao carregar fontes.'
      })
      .addCase(addSource.fulfilled, (state, action) => {
        state.error = null
        state.items.unshift(action.payload)
        state.notice = `${action.payload.downloadCount} jogos importados.`
      })
      .addCase(addSource.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao adicionar fonte.'
      })
      .addCase(deleteSource.fulfilled, (state, action) => {
        state.error = null
        state.items = state.items.filter((item) => item.id !== action.payload)
      })
      .addCase(deleteSource.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao remover fonte.'
      })
      .addCase(syncSource.fulfilled, (state, action) => {
        state.error = null
        const item = state.items.find((source) => source.id === action.payload.sourceId)
        if (item) {
          item.downloadCount = action.payload.downloadCount
        }
        state.notice = action.payload.warning
          ?? `${action.payload.downloadCount.toLocaleString(APP_LOCALE)} jogos atualizados.`
      })
      .addCase(syncSource.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao atualizar catálogo.'
      })
      .addCase(syncAllSources.fulfilled, (state, action) => {
        state.error = null
        for (const result of action.payload.synced) {
          const item = state.items.find((source) => source.id === result.sourceId)
          if (item && !result.warning) {
            item.downloadCount = result.downloadCount
          }
        }
        const updated = action.payload.synced.filter((item) => !item.warning).length
        const warnings = action.payload.synced.filter((item) => item.warning).length
        const failed = action.payload.failures.length
        if (failed > 0) {
          state.error = action.payload.failures.map((item) => `${item.sourceName}: ${item.message}`).join(' · ')
        }
        state.notice =
          failed > 0
            ? `${updated} atualizada(s), ${action.payload.unchangedCount} em dia, ${failed} falha(s).`
            : warnings > 0
              ? `${updated} atualizada(s), ${action.payload.unchangedCount} em dia, ${warnings} aviso(s).`
              : `${updated} atualizada(s), ${action.payload.unchangedCount} já em dia.`
      })
      .addCase(syncAllSources.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao atualizar catálogos.'
      })
  },
})

export const sourcesReducer = sourcesSlice.reducer
