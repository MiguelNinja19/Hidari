import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { collectionsApi } from '../../shared/api/tauri/collectionsApi'
import type { Collection } from '../../shared/types/contracts'

type CollectionsState = {
  items: Collection[]
  loading: boolean
  error: string | null
}

const initialState: CollectionsState = {
  items: [],
  loading: false,
  error: null,
}

export const fetchCollections = createAsyncThunk('collections/fetch', async () =>
  collectionsApi.listCollections(),
)

export const createCollection = createAsyncThunk(
  'collections/create',
  async (name: string) => collectionsApi.createCollection(name),
)

export const deleteCollection = createAsyncThunk(
  'collections/delete',
  async (id: number) => {
    await collectionsApi.deleteCollection(id)
    return id
  },
)

export const addGameToCollection = createAsyncThunk(
  'collections/addGame',
  async (payload: { collectionId: number; gameId: number }) =>
    collectionsApi.addGameToCollection(payload.collectionId, payload.gameId),
)

export const removeGameFromCollection = createAsyncThunk(
  'collections/removeGame',
  async (payload: { collectionId: number; gameId: number }) =>
    collectionsApi.removeGameFromCollection(payload.collectionId, payload.gameId),
)

const collectionsSlice = createSlice({
  name: 'collections',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollections.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCollections.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchCollections.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Erro ao carregar coleções.'
      })
      .addCase(createCollection.fulfilled, (state, action) => {
        state.items.unshift(action.payload)
      })
      .addCase(createCollection.rejected, (state, action) => {
        state.error = action.error.message ?? 'Erro ao criar coleção.'
      })
      .addCase(deleteCollection.fulfilled, (state, action) => {
        state.items = state.items.filter((c) => c.id !== action.payload)
      })
  },
})

export const collectionsReducer = collectionsSlice.reducer
