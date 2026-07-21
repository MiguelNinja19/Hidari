import { createAsyncThunk } from '@reduxjs/toolkit'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { AddSourceInput } from '../../shared/types/contracts'

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
