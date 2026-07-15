export const SETTING_KEY = {
  installOrganization: 'install_organization',
  afterInstallAction: 'after_install_action',
  removeTempFiles: 'remove_temp_files',
  downloadSpeedLimitBps: 'download_speed_limit_bps',
  disabledHydraSourceIds: 'disabled_hydra_source_ids',
  librarySort: 'library_sort',
  minimizeToTray: 'minimize_to_tray',
  notifyReadyToInstall: 'notify_ready_to_install',
  notifyReadyToPlay: 'notify_ready_to_play',
  notifyCatalogChanges: 'notify_catalog_changes',
  notifySound: 'notify_sound',
} as const

/** Preferências booleanas guardadas como `'1'` / `'0'` (default ligado). */
export function parseSettingFlag(value: string | null | undefined, defaultOn = true): boolean {
  if (value === null || value === undefined || value === '') return defaultOn
  return value === '1' || value === 'true'
}

export type LibrarySort = 'title-asc' | 'title-desc' | 'recent'

export function parseLibrarySort(value: string | null | undefined): LibrarySort {
  if (value === 'title-desc' || value === 'recent') return value
  return 'title-asc'
}

export const INSTALL_ORGANIZATION_DEFAULT = 'separate-folder'
export const AFTER_INSTALL_ACTION_DEFAULT = 'ask'

export type SpeedLimitKey = 'ilimitado' | '50mb' | '20mb' | '10mb'

const MB = 1024 * 1024

export function speedKeyToBps(key: string): number {
  switch (key) {
    case '50mb':
      return 50 * MB
    case '20mb':
      return 20 * MB
    case '10mb':
      return 10 * MB
    default:
      return 0
  }
}

export function bpsToSpeedKey(value: string | null | undefined): SpeedLimitKey {
  if (value == null || value === '' || value === '0') return 'ilimitado'
  const n = Number(value)
  if (n === 50 * MB) return '50mb'
  if (n === 20 * MB) return '20mb'
  if (n === 10 * MB) return '10mb'
  return 'ilimitado'
}
