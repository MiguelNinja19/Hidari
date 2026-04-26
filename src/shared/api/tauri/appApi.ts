import { tauriClient } from './client'
import type { AppPaths } from '../../types/contracts'

export const appApi = {
  ping: () => tauriClient.invoke<string>('ping'),
  appVersion: () => tauriClient.invoke<string>('app_version'),
  getPaths: () => tauriClient.invoke<AppPaths>('get_paths'),
}
