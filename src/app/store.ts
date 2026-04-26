import { configureStore } from '@reduxjs/toolkit'
import { sourcesReducer } from '../features/sources/sourcesSlice'
import { downloadsReducer } from '../features/downloads/downloadsSlice'
import { libraryReducer } from '../features/library/librarySlice'
import { queueReducer } from '../features/queue/queueSlice'
import { collectionsReducer } from '../features/collections/collectionsSlice'

export const store = configureStore({
  reducer: {
    sources: sourcesReducer,
    downloads: downloadsReducer,
    library: libraryReducer,
    queue: queueReducer,
    collections: collectionsReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
