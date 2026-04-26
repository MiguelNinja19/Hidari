import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { downloadsApi } from '../../shared/api/tauri/downloadsApi'
import type { DownloadProgressEvent } from '../../shared/types/contracts'

type DownloadsState = {
  current: DownloadProgressEvent | null
  running: boolean
  error: string | null
}

const initialState: DownloadsState = {
  current: null,
  running: false,
  error: null,
}

export const startMockDownload = createAsyncThunk(
  'downloads/startMock',
  async (downloadId: string) => {
    await downloadsApi.startMockDownload(downloadId)
    return downloadId
  },
)

const downloadsSlice = createSlice({
  name: 'downloads',
  initialState,
  reducers: {
    progressReceived: (state, action: { payload: DownloadProgressEvent }) => {
      state.current = action.payload
      state.running = action.payload.status !== 'completed'
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startMockDownload.pending, (state) => {
        state.running = true
        state.error = null
      })
      .addCase(startMockDownload.rejected, (state, action) => {
        state.running = false
        state.error = action.error.message ?? 'Erro ao iniciar download.'
      })
  },
})

export const { progressReceived } = downloadsSlice.actions
export const downloadsReducer = downloadsSlice.reducer
