import { tauriClient } from './client'
import type { LibraryPathState, LocalLibraryItem } from '../../types/contracts'

export const libraryApi = {
  scanDefaultDownloadPath: () =>
    tauriClient.invoke<LocalLibraryItem[]>('scan_default_download_path'),
  addExternalLibraryGame: (path: string, title?: string | null) =>
    tauriClient.invoke<{ title: string; path: string }>('add_external_library_game', {
      payload: { path, title: title?.trim() ? title : null },
    }),
  deleteLocalLibraryItem: (path: string, title?: string) =>
    tauriClient.invoke<void>('delete_local_library_item', {
      payload: { path, title: title?.trim() ? title : null },
    }),
  getLibraryInstalledLocations: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<string[]>('get_library_installed_locations', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  uninstallLibraryItem: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<void>('uninstall_library_item', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  openLocalPath: (path: string) => tauriClient.invoke<void>('open_local_path', { path }),
  launchGame: (title: string, path: string, jobId?: string, preferredExe?: string | null) =>
    tauriClient.invoke<string>('launch_game_from_path', {
      payload: {
        title,
        path,
        jobId: jobId ?? null,
        preferredExe: preferredExe?.trim() || null,
      },
    }),
  inspectLibraryPath: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<LibraryPathState>('inspect_library_path', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  inspectLibraryPaths: (entries: import('../../types/contracts').InspectLibraryPathInput[]) =>
    tauriClient.invoke<import('../../types/contracts').InspectLibraryPathResult[]>(
      'inspect_library_paths',
      {
        payload: {
          entries: entries.map((entry) => ({
            key: entry.key,
            title: entry.title,
            path: entry.path,
            jobId: entry.jobId ?? null,
          })),
        },
      },
    ),
  setLibraryGameRoot: (title: string, destPath: string, gameRoot: string, jobId?: string) =>
    tauriClient.invoke<LibraryPathState>('set_library_game_root', {
      payload: { title, destPath, gameRoot, jobId: jobId ?? null },
    }),
  setLibraryLaunchExe: (title: string, destPath: string, exePath: string) =>
    tauriClient.invoke<void>('set_library_launch_exe', {
      payload: { title, destPath, exePath },
    }),
  getLibraryNote: (path: string, title: string) =>
    tauriClient.invoke<string>('get_library_note', { payload: { path, title, note: null } }),
  setLibraryNote: (path: string, title: string, note: string) =>
    tauriClient.invoke<void>('set_library_note', { payload: { path, title, note } }),
  launchSetup: (
    title: string,
    path: string,
    jobId?: string,
    preferredSetup?: string | null,
  ) =>
    tauriClient.invoke<string>('launch_setup_from_path', {
      payload: { title, path, jobId: jobId ?? null, preferredSetup: preferredSetup?.trim() || null },
    }),
  isExecutableRunning: (path: string) =>
    tauriClient.invoke<boolean>('is_executable_running_at_path', { path }),
  extractLibraryFolder: (title: string, path: string, jobId?: string) =>
    tauriClient.invoke<void>('extract_library_folder', {
      payload: { title, path, jobId: jobId ?? null },
    }),
  createDesktopShortcut: (title: string, destPath: string, iconPath?: string | null) =>
    tauriClient.invoke<string>('create_library_desktop_shortcut', {
      payload: {
        title,
        destPath,
        iconPath: iconPath?.trim() || null,
      },
    }),
  openOriginLauncher: (path: string) =>
    tauriClient.invoke<void>('open_library_origin_launcher', { path }),
  listFavoriteCatalogEntries: () =>
    tauriClient.invoke<import('../../types/contracts').FavoriteCatalogEntry[]>(
      'list_favorite_catalog_entries',
    ),
  toggleFavoriteCatalogEntry: (title: string, catalogKey?: string) =>
    tauriClient.invoke<boolean>('toggle_favorite_catalog_entry', {
      payload: { title, catalogKey: catalogKey ?? null },
    }),
  isFavoriteCatalogEntry: (catalogKey: string) =>
    tauriClient.invoke<boolean>('is_favorite_catalog_entry', { catalogKey }),
  listLibraryPlayStats: () =>
    tauriClient.invoke<import('../../types/contracts').LibraryPlayStat[]>('list_library_play_stats'),
}
