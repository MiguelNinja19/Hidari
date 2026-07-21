import { tauriClient } from './client'

export const launcherSettingsApi = {
  setDefaultDownloadPath: (path: string) =>
    tauriClient.invoke<void>('set_default_download_path', { payload: { path } }),
  getDefaultDownloadPath: () =>
    tauriClient.invoke<string | null>('get_default_download_path'),
  setSeedTorrentsEnabled: (enabled: boolean) =>
    tauriClient.invoke<void>('set_seed_torrents_enabled', { payload: { enabled } }),
  getSeedTorrentsEnabled: () => tauriClient.invoke<boolean>('get_seed_torrents_enabled'),
  getAppSetting: (key: string) =>
    tauriClient.invoke<string | null>('get_app_setting', { payload: { key } }),
  setAppSetting: (key: string, value: string) =>
    tauriClient.invoke<void>('set_app_setting', { payload: { key, value } }),
  getDiskFreeBytesForPath: (path: string) =>
    tauriClient.invoke<number | null>('get_disk_free_bytes_for_path', { payload: { path } }),
}
