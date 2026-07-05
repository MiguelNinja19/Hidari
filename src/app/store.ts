import { configureStore } from '@reduxjs/toolkit'
import { sourcesReducer } from '../features/sources/sourcesSlice'
import { queueReducer } from '../features/queue/queueSlice'

export const store = configureStore({
  reducer: {
    sources: sourcesReducer,
    queue: queueReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
