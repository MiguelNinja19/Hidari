import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useAppSettings } from "../context/AppSettingsContext";
import { cleanTitleForDisplay } from "../../shared/utils/normalizeTitleKey";
import type { DownloadJob } from "../../shared/types/contracts";
import {
  resolveDownloadNotifyKind,
  type DownloadNotifySnapshot,
} from "./downloadNotifyKind";

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

function snapshotOf(job: DownloadJob): DownloadNotifySnapshot {
  return {
    status: job.status,
    extractionStatus: job.extractionStatus ?? null,
  };
}

type UseDownloadNotificationsOptions = {
  onReadyToInstall?: (gameTitle: string) => void;
  onReadyToPlay?: (gameTitle: string) => void;
};

/** Notifica (OS + callbacks) quando o job fica pronto para instalar ou jogar. */
export function useDownloadNotifications(
  jobs: DownloadJob[],
  options: UseDownloadNotificationsOptions = {},
) {
  const { t } = useTranslation();
  const {
    notifyReadyToInstall,
    notifyReadyToPlay,
    notifySound,
  } = useAppSettings();
  const prevRef = useRef<Map<string, DownloadNotifySnapshot>>(new Map());
  const onReadyToInstallRef = useRef(options.onReadyToInstall);
  const onReadyToPlayRef = useRef(options.onReadyToPlay);
  onReadyToInstallRef.current = options.onReadyToInstall;
  onReadyToPlayRef.current = options.onReadyToPlay;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const pending: Array<{ kind: "install" | "play"; gameTitle: string }> =
        [];

      for (const job of jobs) {
        const next = snapshotOf(job);
        const prev = prevRef.current.get(job.id) ?? null;
        prevRef.current.set(job.id, next);

        const kind = resolveDownloadNotifyKind(prev, next);
        if (!kind) continue;
        if (kind === "install" && !notifyReadyToInstall) continue;
        if (kind === "play" && !notifyReadyToPlay) continue;
        pending.push({ kind, gameTitle: cleanTitleForDisplay(job.title) });
      }

      if (pending.length === 0 || cancelled) return;

      const canNotify = await ensureNotificationPermission();
      if (cancelled) return;

      for (const item of pending) {
        const title =
          item.kind === "install"
            ? t("downloads.notifyReadyToInstall")
            : t("downloads.notifyReadyToPlay");
        const body = t("downloads.notifyReadyBody", { title: item.gameTitle });

        if (item.kind === "install") {
          onReadyToInstallRef.current?.(item.gameTitle);
        } else {
          onReadyToPlayRef.current?.(item.gameTitle);
        }

        if (!canNotify) continue;
        try {
          await sendNotification({
            title,
            body,
            extra: {
              hidariNav: item.kind === "install" ? "downloads" : "library",
            },
            ...(notifySound ? {} : { silent: true }),
          });
        } catch {
          // ignorar falha de notificação OS
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobs, notifyReadyToInstall, notifyReadyToPlay, notifySound, t]);
}
