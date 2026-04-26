import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { gamesApi } from '../../shared/api/tauri/gamesApi'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { AddGameInput, Game, UpdateGameInput } from '../../shared/types/contracts'

type LibraryState = {
  items: Game[]
  loading: boolean
  error: string | null
}

const initialState: LibraryState = {
  items: [],
  loading: false,
  error: null,
}

export const fetchGames = createAsyncThunk('library/fetchGames', async () => gamesApi.listGames())

export const addGame = createAsyncThunk('library/addGame', async (payload: AddGameInput) =>
  gamesApi.addGame(payload),
)

export const updateGame = createAsyncThunk(
  'library/updateGame',
  async (payload: UpdateGameInput) => gamesApi.updateGame(payload),
)

export const removeGame = createAsyncThunk('library/removeGame', async (id: number) => {
  await gamesApi.removeGame(id)
  return id
})

export const toggleGameFavorite = createAsyncThunk(
  'library/toggleGameFavorite',
  async (payload: { id: number; favorite: boolean }) =>
    gamesApi.toggleFavorite(payload.id, payload.favorite),
)

export const refreshSourceChanges = createAsyncThunk('library/refreshSourceChanges', async () =>
  sourcesApi.getDownloadSourcesChanges(),
)

const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGames.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGames.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchGames.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message ?? 'Erro ao carregar jogos.'
      })
      .addCase(addGame.fulfilled, (state, action) => {
        state.items.unshift(action.payload)
      })
      .addCase(updateGame.fulfilled, (state, action) => {
        state.items = state.items.map((game) =>
          game.id === action.payload.id ? action.payload : game,
        )
      })
      .addCase(removeGame.fulfilled, (state, action) => {
        state.items = state.items.filter((game) => game.id !== action.payload)
      })
      .addCase(toggleGameFavorite.fulfilled, (state, action) => {
        state.items = state.items.map((game) =>
          game.id === action.payload.id ? action.payload : game,
        )
      })
      .addCase(refreshSourceChanges.fulfilled, (state, action) => {
        const changes = new Map(
          action.payload.map((entry) => [entry.gameId, entry.newDownloadOptionsCount]),
        )
        state.items = state.items.map((game) => ({
          ...game,
          newDownloadOptionsCount: changes.get(game.id) ?? game.newDownloadOptionsCount ?? 0,
        }))
      })
  },
})

export const libraryReducer = librarySlice.reducer
