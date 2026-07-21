import { createSlice } from '@reduxjs/toolkit'
import { attachSourcesReducers } from './sourcesReducers'
import { initialSourcesState } from './sourcesState'

export {
  addSource,
  deleteSource,
  fetchSources,
  syncAllSources,
  syncSource,
} from './sourcesThunks'

const sourcesSlice = createSlice({
  name: 'sources',
  initialState: initialSourcesState,
  reducers: {},
  extraReducers: (builder) => {
    attachSourcesReducers(builder)
  },
})

export const sourcesReducer = sourcesSlice.reducer
