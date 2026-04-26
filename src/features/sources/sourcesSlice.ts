import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { AddSourceInput, Source } from '../../shared/types/contracts'

type SourcesState = {
  items: Source[]
  loading: boolean
  error: string | null
}

const initialState: SourcesState = {
  items: [],
  loading: false,
  error: null,
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
  async (sourceId: number) => {
    await sourcesApi.removeSource(sourceId)
    return sourceId
  },
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
        state.items.unshift(action.payload)
      })
      .addCase(addSource.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao adicionar fonte.'
      })
      .addCase(deleteSource.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload)
      })
      .addCase(deleteSource.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao remover fonte.'
      })
  },
})

export const sourcesReducer = sourcesSlice.reducer
