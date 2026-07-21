import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  INSTALL_WATCH_INSPECT_EVERY_TICKS,
  INSTALL_WATCH_MAX_TICKS,
  INSTALL_WATCH_POST_CLOSE_TICKS,
  INSTALL_WATCH_START_GRACE_TICKS,
} from '../../shared/config/polling'

export type InstallWatch = {
  intervalId: number
  busyKey: string
  setupPath: string
  ticks: number
  sawInstallerRunning: boolean
  installerClosedTick: number | null
}

type TickArgs = {
  watches: Map<string, InstallWatch>
  watchKey: string
  title: string
  destPath: string
  jobId?: string
  refreshPathState: (
    title: string,
    path: string,
    jobId?: string,
  ) => Promise<{ hasGame: boolean }>
  stopInstallWatch: (watchKey: string) => void
}

async function updateInstallerState(watch: InstallWatch) {
  if (!watch.setupPath || watch.ticks <= INSTALL_WATCH_START_GRACE_TICKS) return false
  const running = await sourcesApi.isExecutableRunning(watch.setupPath).catch(() => false)
  if (running) {
    watch.sawInstallerRunning = true
    watch.installerClosedTick = null
  } else if (watch.sawInstallerRunning && watch.installerClosedTick === null) {
    watch.installerClosedTick = watch.ticks
  }
  return (
    !running &&
    watch.installerClosedTick !== null &&
    watch.ticks - watch.installerClosedTick >= INSTALL_WATCH_POST_CLOSE_TICKS
  )
}

function shouldInspectThisTick(watch: InstallWatch): boolean {
  // Primeiro tick e após fechar o instalador: sempre.
  if (watch.ticks <= 1) return true
  if (watch.installerClosedTick !== null) return true
  // Enquanto o setup corre (ou ainda não abriu): inspect raro — evita freeze periódico.
  return watch.ticks % INSTALL_WATCH_INSPECT_EVERY_TICKS === 0
}

export async function tickInstallWatch(args: TickArgs) {
  const watch = args.watches.get(args.watchKey)
  if (!watch) return
  watch.ticks += 1
  try {
    if (shouldInspectThisTick(watch)) {
      const state = await args.refreshPathState(args.title, args.destPath, args.jobId)
      if (state.hasGame) {
        args.stopInstallWatch(args.watchKey)
        return
      }
    }
  } catch {
    // Continue monitoring transient inspection failures.
  }
  if (await updateInstallerState(watch)) {
    args.stopInstallWatch(args.watchKey)
    return
  }
  if (watch.ticks >= INSTALL_WATCH_MAX_TICKS) args.stopInstallWatch(args.watchKey)
}
