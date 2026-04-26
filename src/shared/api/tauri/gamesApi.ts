import { tauriClient } from './client'
import type { AddGameInput, Game, UpdateGameInput } from '../../types/contracts'

export const gamesApi = {
  listGames: () => tauriClient.invoke<Game[]>('list_games'),
  addGame: (payload: AddGameInput) => tauriClient.invoke<Game>('add_game', { payload }),
  updateGame: (payload: UpdateGameInput) => tauriClient.invoke<Game>('update_game', { payload }),
  removeGame: (id: number) => tauriClient.invoke<void>('remove_game', { payload: { id } }),
  toggleFavorite: (id: number, favorite: boolean) =>
    tauriClient.invoke<Game>('toggle_game_favorite', { payload: { id, favorite } }),
}
