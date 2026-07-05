export const SETTING_KEY = {
  installOrganization: 'install_organization',
  afterInstallAction: 'after_install_action',
  verifyAfterDownload: 'verify_after_download',
  removeTempFiles: 'remove_temp_files',
  downloadSpeedLimitBps: 'download_speed_limit_bps',
  disabledHydraSourceIds: 'disabled_hydra_source_ids',
} as const

export const INSTALL_ORGANIZATION_DEFAULT = 'separate-folder'
export const AFTER_INSTALL_ACTION_DEFAULT = 'ask'

export const SPEED_LIMIT_OPTIONS = ['ilimitado', '50mb', '20mb', '10mb'] as const
export type SpeedLimitKey = (typeof SPEED_LIMIT_OPTIONS)[number]

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
