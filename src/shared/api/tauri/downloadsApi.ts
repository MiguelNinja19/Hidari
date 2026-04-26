import { tauriClient } from './client'

export const downloadsApi = {
  startMockDownload: (downloadId: string) =>
    tauriClient.invoke<void>('start_mock_download', {
      payload: { downloadId },
    }),
}
