import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { gamesApi } from '../../shared/api/tauri/gamesApi'
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
  },
})

export const libraryReducer = librarySlice.reducer
