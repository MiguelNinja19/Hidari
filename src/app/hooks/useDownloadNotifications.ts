import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "../context/AppSettingsContext";
import { cleanTitleForDisplay } from "../../shared/utils/normalizeTitleKey";
import {
  sendHidariNotification,
  warmNotificationPermission,
} from "../../shared/utils/osNotification";
import type { DownloadJob } from "../../shared/types/contracts";
import {
  resolveDownloadNotifyKind,
  type DownloadNotifySnapshot,
} from "./downloadNotifyKind";

function snapshotOf(job: DownloadJob): DownloadNotifySnapshot {
  return {
    status: job.status,
    extractionStatus: job.extractionStatus ?? null,
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded,
    totalBytes: job.totalBytes,
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
  } = useAppSettings();
  const prevRef = useRef<Map<string, DownloadNotifySnapshot>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());
  const onReadyToInstallRef = useRef(options.onReadyToInstall);
  const onReadyToPlayRef = useRef(options.onReadyToPlay);
  onReadyToInstallRef.current = options.onReadyToInstall;
  onReadyToPlayRef.current = options.onReadyToPlay;

  useEffect(() => {
    warmNotificationPermission();
  }, []);

  useEffect(() => {
    const pending: Array<{
      kind: "install" | "play";
      gameTitle: string;
    }> = [];

    for (const job of jobs) {
      const next = snapshotOf(job);
      const prev = prevRef.current.get(job.id) ?? null;
      prevRef.current.set(job.id, next);

      const kind = resolveDownloadNotifyKind(prev, next);
      if (!kind) continue;
      if (kind === "install" && !notifyReadyToInstall) continue;
      if (kind === "play" && !notifyReadyToPlay) continue;

      const dedupeKey = `${job.id}:${kind}`;
      if (notifiedRef.current.has(dedupeKey)) continue;
      notifiedRef.current.add(dedupeKey);
      pending.push({ kind, gameTitle: cleanTitleForDisplay(job.title) });
    }

    if (pending.length === 0) return;

    // Toast in-app imediato — não depende de permissão nem de async cancelável.
    for (const item of pending) {
      if (item.kind === "install") {
        onReadyToInstallRef.current?.(item.gameTitle);
      } else {
        onReadyToPlayRef.current?.(item.gameTitle);
      }
    }

    // OS toast em fire-and-forget: NÃO abortar se a fila atualizar a meio
    // (era a causa de notificações “sumirem” no fim do download).
    void (async () => {
      for (const item of pending) {
        const title =
          item.kind === "install"
            ? t("downloads.notifyReadyToInstall")
            : t("downloads.notifyReadyToPlay");
        const body = t("downloads.notifyReadyBody", { title: item.gameTitle });
        await sendHidariNotification({
          title,
          body,
          extra: {
            hidariNav: item.kind === "install" ? "downloads" : "library",
          },
        });
      }
    })();
  }, [jobs, notifyReadyToInstall, notifyReadyToPlay, t]);
}
