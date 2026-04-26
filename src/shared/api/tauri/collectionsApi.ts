import { tauriClient } from './client'
import type { Collection } from '../../types/contracts'

export const collectionsApi = {
  listCollections: () => tauriClient.invoke<Collection[]>('list_collections'),
  createCollection: (name: string) =>
    tauriClient.invoke<Collection>('create_collection', { payload: { name } }),
  deleteCollection: (id: number) =>
    tauriClient.invoke<void>('delete_collection', { payload: { id } }),
  addGameToCollection: (collectionId: number, gameId: number) =>
    tauriClient.invoke<void>('add_game_to_collection', {
      payload: { collectionId, gameId },
    }),
  removeGameFromCollection: (collectionId: number, gameId: number) =>
    tauriClient.invoke<void>('remove_game_from_collection', {
      payload: { collectionId, gameId },
    }),
  listCollectionGames: (id: number) =>
    tauriClient.invoke<void>('list_collection_games', { payload: { id } }),
}
