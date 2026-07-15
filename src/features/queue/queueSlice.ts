import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { queueApi } from '../../shared/api/tauri/queueApi'
import type {
  DownloadJob,
  EnqueueJobInput,
  ExtractStatusEvent,
  JobProgressEvent,
} from '../../shared/types/contracts'
import { resolveJobProgressPercentFromFields } from '../../shared/utils/jobProgress'

type QueueState = {
  jobs: DownloadJob[]
  dismissedJobIds: string[]
  loading: boolean
  error: string | null
  initialized: boolean
}

const normalizeJobProgress = (job: DownloadJob) =>
  resolveJobProgressPercentFromFields({
    progress: job.progress,
    bytesDownloaded: Number.isFinite(job.bytesDownloaded) ? Math.max(0, job.bytesDownloaded) : 0,
    totalBytes: Number.isFinite(job.totalBytes) ? job.totalBytes : 0,
    status: job.status,
    url: job.url,
    speedBps: job.speedBps,
  })

const normalizeJob = (job: DownloadJob): DownloadJob => ({
  ...job,
  updatedAt: job.updatedAt ?? job.createdAt,
})

const jobProgressSignal = (job: DownloadJob) =>
  normalizeJobProgress(job) > 0 ||
  job.bytesDownloaded > 0 ||
  job.totalBytes > 0 ||
  (job.speedBps ?? 0) > 0

const shouldPreserveProgress = (incoming: DownloadJob, previous?: DownloadJob) => {
  if (!previous) return false
  if (!jobProgressSignal(previous)) return false
  if (jobProgressSignal(incoming)) return false
  return (
    incoming.status === 'paused' ||
    incoming.status === 'downloading' ||
    incoming.status === 'pending' ||
    incoming.status === 'retrying' ||
    incoming.status === 'seeding'
  )
}

const shouldPreserveExtractionStatus = (incoming: DownloadJob, previous?: DownloadJob) => {
  const localStatuses = ['extracting', 'extracted', 'failed', 'skipped'] as const
  if (localStatuses.includes(incoming.status as (typeof localStatuses)[number])) {
    return {
      ...incoming,
      progress:
        incoming.status === 'extracted' || incoming.status === 'skipped' ? 100 : incoming.progress,
    }
  }
  if (!previous) return incoming
  if (
    localStatuses.includes(previous.status as (typeof localStatuses)[number]) &&
    incoming.status === 'completed'
  ) {
    return {
      ...incoming,
      status: previous.status === 'skipped' ? 'completed' : previous.status,
      progress:
        previous.status === 'extracted' || previous.status === 'skipped' ? 100 : incoming.progress,
      errorMsg: previous.errorMsg ?? incoming.errorMsg,
    }
  }
  return incoming
}

const initialState: QueueState = {
  jobs: [],
  dismissedJobIds: [],
  loading: false,
  error: null,
  initialized: false,
}

export const fetchJobs = createAsyncThunk(
  'queue/fetchJobs',
  async (_options?: { silent?: boolean }) => queueApi.listJobs(),
)

export const enqueueJob = createAsyncThunk('queue/enqueueJob', async (payload: EnqueueJobInput) =>
  queueApi.enqueueJob(payload),
)

export const cancelJob = createAsyncThunk('queue/cancelJob', async (id: string) => {
  await queueApi.cancelJob(id)
  return id
})

export const pauseJob = createAsyncThunk('queue/pauseJob', async (id: string) => {
  await queueApi.pauseJob(id)
  return id
})

export const resumeJob = createAsyncThunk('queue/resumeJob', async (id: string) => {
  await queueApi.resumeJob(id)
  return id
})

export const clearCompletedJobs = createAsyncThunk('queue/clearCompleted', async () => {
  return queueApi.clearCompletedJobs()
})

const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    jobProgressReceived: (state, action: { payload: JobProgressEvent }) => {
      const {
        jobId: rawJobId,
        progress,
        status,
        speedBytesPerSec,
        etaSeconds,
        bytesDownloaded,
        totalBytes,
        errorMsg,
      } = action.payload
      const jobId = String(rawJobId)
      if (state.dismissedJobIds.includes(jobId)) return
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job) return
      const merged: DownloadJob = {
        ...job,
        status,
        progress,
        speedBps: speedBytesPerSec,
        etaSeconds,
        bytesDownloaded: bytesDownloaded ?? job.bytesDownloaded,
        totalBytes: totalBytes ?? job.totalBytes,
      }
      // Não apagar progresso real com eventos a 0 (continue-torrent / metadados).
      if (
        bytesDownloaded != null &&
        bytesDownloaded === 0 &&
        job.bytesDownloaded > 0 &&
        !['cancelled', 'failed'].includes(status)
      ) {
        merged.bytesDownloaded = job.bytesDownloaded
      }
      if (
        totalBytes != null &&
        totalBytes === 0 &&
        job.totalBytes > 0 &&
        !['cancelled', 'failed'].includes(status)
      ) {
        merged.totalBytes = job.totalBytes
      }
      // Não regredir bytes (excepto cancel/fail).
      if (
        bytesDownloaded != null &&
        bytesDownloaded > 0 &&
        job.bytesDownloaded > bytesDownloaded &&
        !['cancelled', 'failed'].includes(status)
      ) {
        merged.bytesDownloaded = Math.max(job.bytesDownloaded, bytesDownloaded)
      }
      if (
        totalBytes != null &&
        totalBytes > 0 &&
        job.totalBytes > totalBytes &&
        !['cancelled', 'failed'].includes(status)
      ) {
        merged.totalBytes = Math.max(job.totalBytes, totalBytes)
      }
      job.status = merged.status
      job.speedBps = merged.speedBps
      job.etaSeconds = merged.etaSeconds
      job.bytesDownloaded = merged.bytesDownloaded
      job.totalBytes = merged.totalBytes

      const sizeNow = Math.max(merged.bytesDownloaded ?? 0, merged.totalBytes ?? 0)
      const softAwaiting =
        typeof errorMsg === 'string' &&
        /conteúdo do torrent|obter o conteúdo|aguardar conteúdo|metadados/i.test(errorMsg)
      const stickySoft =
        typeof job.errorMsg === 'string' &&
        /conteúdo do torrent|obter o conteúdo|aguardar conteúdo|metadados/i.test(job.errorMsg)
      const fullyDone =
        (merged.totalBytes ?? 0) >= 5 * 1024 * 1024 &&
        (merged.bytesDownloaded ?? 0) >= (merged.totalBytes ?? 0) * 0.995
      const stillTransferring =
        ['downloading', 'pending', 'retrying'].includes(status) &&
        (merged.totalBytes ?? 0) >= 5 * 1024 * 1024 &&
        (merged.bytesDownloaded ?? 0) < (merged.totalBytes ?? 0) * 0.995

      // Conteúdo a meio: limpar skipped/progress falso de metadados e usar % dos bytes.
      if (stillTransferring) {
        if (job.extractionStatus === 'skipped' || job.extractionStatus === 'verified') {
          job.extractionStatus = null
        }
        job.status = 'downloading'
        job.progress =
          ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
      } else if (fullyDone && ['downloading', 'pending', 'retrying', 'seeding'].includes(status)) {
        if (status === 'seeding') {
          job.status = 'seeding'
        } else {
          job.status = 'completed'
        }
        job.progress = 100
      } else if (
        softAwaiting &&
        sizeNow < 5 * 1024 * 1024 &&
        (status === 'downloading' || status === 'completed' || status === 'seeding')
      ) {
        // Só “voltar à fase metadados” se o payload ainda for minúsculo.
        job.progress = 0
        job.status = 'downloading'
        if (job.extractionStatus === 'skipped' || job.extractionStatus === 'verified') {
          job.extractionStatus = 'pending_content'
        }
        if ((job.totalBytes ?? 0) > 0 && (job.totalBytes ?? 0) < 5 * 1024 * 1024) {
          job.totalBytes = 0
          job.bytesDownloaded = 0
        }
      } else if (
        progress <= 0 &&
        job.progress > 0 &&
        (merged.bytesDownloaded > 0 || merged.totalBytes > 0) &&
        !['cancelled', 'failed'].includes(status)
      ) {
        if ((merged.totalBytes ?? 0) >= 5 * 1024 * 1024 || (merged.bytesDownloaded ?? 0) >= 5 * 1024 * 1024) {
          // Com tamanho real, o % da UI vem dos bytes — não preservar 100% sticky.
          if (stillTransferring || (merged.totalBytes ?? 0) > 0) {
            job.progress =
              (merged.totalBytes ?? 0) > 0
                ? ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
                : job.progress
          } else {
            job.progress = job.progress
          }
        } else {
          job.progress = progress
        }
      } else if (!fullyDone) {
        job.progress =
          (merged.totalBytes ?? 0) >= 5 * 1024 * 1024
            ? ((merged.bytesDownloaded ?? 0) / (merged.totalBytes ?? 1)) * 100
            : progress
      }

      job.updatedAt = new Date().toISOString()
      if (errorMsg != null) {
        job.errorMsg = errorMsg.trim() ? errorMsg : null
      }
      if (sizeNow >= 5 * 1024 * 1024 && (softAwaiting || stickySoft)) {
        job.errorMsg = null
        if (job.extractionStatus === 'pending_content') {
          job.extractionStatus = null
        }
      }
      if (
        fullyDone &&
        typeof job.errorMsg === 'string' &&
        /download_stalled|Sem atividade|retomar automaticamente|stall/i.test(job.errorMsg)
      ) {
        job.errorMsg = null
      }
    },
    extractStatusReceived: (state, action: { payload: ExtractStatusEvent }) => {
      const { jobId: rawJobId, status, message } = action.payload
      const jobId = String(rawJobId)
      const job = state.jobs.find((j) => String(j.id) === jobId)
      if (!job) return
      if (status === 'verified' || status === 'verify_failed') {
        job.extractionStatus = status
        if (status === 'verify_failed') {
          // Mantém completed/seeding/extracted — senão o jogo some da Biblioteca.
          if (message) job.errorMsg = message
        }
        return
      }
      if (status === 'skipped') {
        job.status = 'completed'
        job.extractionStatus = 'skipped'
        // Só 100% se não estamos a “obter conteúdo” e há tamanho real (ou desconhecido).
        const awaiting =
          typeof job.errorMsg === 'string' &&
          /conteúdo do torrent|obter o conteúdo|aguardar|metadados/i.test(job.errorMsg)
        const tiny =
          (job.totalBytes > 0 && job.totalBytes < 5 * 1024 * 1024) ||
          (job.bytesDownloaded > 0 && job.bytesDownloaded < 5 * 1024 * 1024)
        if (awaiting || tiny) {
          job.progress = 0
          job.errorMsg = job.errorMsg?.trim() || 'A obter o conteúdo do torrent…'
        } else {
          job.progress = 100
          if (job.errorMsg && /conteúdo|metadados|aguardar/i.test(job.errorMsg)) {
            job.errorMsg = null
          }
        }
        return
      }
      if (status === 'failed') {
        job.extractionStatus = 'failed'
        if (message) job.errorMsg = message
        // Não demove um download já concluído para fora da Biblioteca.
        if (
          !['completed', 'seeding', 'extracted', 'skipped', 'extracting'].includes(job.status)
        ) {
          job.status = 'failed'
        }
        return
      }
      job.status = status
      job.extractionStatus = status
      if (status === 'extracted') job.progress = 100
    },
    removeJobLocally: (state, action: { payload: string }) => {
      const id = action.payload
      state.jobs = state.jobs.filter((job) => job.id !== id)
      if (!state.dismissedJobIds.includes(id)) {
        state.dismissedJobIds.push(id)
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        if (!state.initialized) {
          state.loading = true
        }
        state.error = null
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.loading = false
        state.initialized = true
        const previousById = new Map(state.jobs.map((job) => [job.id, job]))
        const dismissed = new Set(state.dismissedJobIds)
        const incoming = action.payload
          .filter((raw) => !dismissed.has(raw.id))
          .map((raw) => {
            const previous = previousById.get(raw.id)
            const withExtraction = shouldPreserveExtractionStatus(raw, previous)
            const merged = shouldPreserveProgress(withExtraction, previous)
              ? {
                  ...withExtraction,
                  progress: previous?.progress ?? withExtraction.progress,
                }
              : withExtraction
            return normalizeJob(merged)
          })
        const incomingIds = new Set(incoming.map((job) => job.id))
        const localOnly = state.jobs.filter(
          (job) =>
            !incomingIds.has(job.id) &&
            !dismissed.has(job.id) &&
            [
              'extracting',
              'extracted',
              'failed',
              'completed',
              'seeding',
              'skipped',
              'verify_failed',
            ].includes(job.status),
        )
        state.jobs = [...incoming, ...localOnly.map((job) => normalizeJob(job))]
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.loading = false
        state.initialized = true
        if (action.meta.arg?.silent) return
        const message = action.error.message ?? 'Erro ao carregar fila.'
        // Não persistir erros transitórios do sidecar (evita toast a cada poll/retry).
        if (
          /sidecar_not_running|sidecar_request_failed|sidecar_parse_failed|download-engine|connection refused|os error 10061|timed out/i.test(
            message,
          )
        ) {
          return
        }
        state.error = message
      })
      .addCase(enqueueJob.fulfilled, (state, action) => {
        state.jobs.push(normalizeJob(action.payload))
        state.error = null
      })
      .addCase(enqueueJob.rejected, (state, action) => {
        const message = action.error.message ?? 'Erro ao enfileirar download.'
        if (
          /sidecar_not_running|sidecar_request_failed|connection refused|os error 10061/i.test(
            message,
          )
        ) {
          return
        }
        state.error = message
      })
      .addCase(cancelJob.fulfilled, (state, action) => {
        const id = String(action.payload)
        state.jobs = state.jobs.filter((j) => String(j.id) !== id)
        if (!state.dismissedJobIds.includes(id)) {
          state.dismissedJobIds.push(id)
        }
        state.error = null
      })
      .addCase(cancelJob.rejected, (state, action) => {
        const message = action.error.message ?? 'Erro ao cancelar download.'
        if (/sidecar_not_running|sidecar_request_failed|connection refused/i.test(message)) {
          return
        }
        state.error = message
      })
      .addCase(pauseJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'paused'
        state.error = null
      })
      .addCase(pauseJob.rejected, (state, action) => {
        const message = action.error.message ?? 'Erro ao pausar download.'
        if (/sidecar_not_running|sidecar_request_failed|connection refused/i.test(message)) {
          return
        }
        state.error = message
      })
      .addCase(resumeJob.fulfilled, (state, action) => {
        const job = state.jobs.find((j) => j.id === action.payload)
        if (job) job.status = 'pending'
        state.error = null
      })
      .addCase(resumeJob.rejected, (state, action) => {
        const message = action.error.message ?? 'Erro ao retomar download.'
        if (/sidecar_not_running|sidecar_request_failed|connection refused/i.test(message)) {
          return
        }
        state.error = message
      })
      .addCase(clearCompletedJobs.fulfilled, (state, action) => {
        const removed = new Set(action.payload)
        state.jobs = state.jobs.filter((j) => !removed.has(j.id))
        for (const id of removed) {
          if (!state.dismissedJobIds.includes(id)) {
            state.dismissedJobIds.push(id)
          }
        }
        state.error = null
      })
      .addCase(clearCompletedJobs.rejected, (state, action) => {
        const message = action.error.message ?? 'Erro ao limpar concluídos.'
        if (/sidecar_not_running|sidecar_request_failed|connection refused/i.test(message)) {
          return
        }
        state.error = message
      })  },
})

export const { jobProgressReceived, extractStatusReceived, removeJobLocally } = queueSlice.actions
export const queueReducer = queueSlice.reducer
