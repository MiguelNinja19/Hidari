import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useToast } from '../../shared/components/ToastProvider'
import { fetchSources, syncAllSources, syncSource } from '../sources/sourcesSlice'

export function useSourceSync() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { showSuccess } = useToast()
  const sources = useAppSelector((state) => state.sources.items)
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null)
  const [syncingAllSources, setSyncingAllSources] = useState(false)

  const onSyncSource = async (sourceId: string, sourceName: string) => {
    if (syncingSourceId !== null || syncingAllSources) return
    setSyncingSourceId(sourceId)
    try {
      await dispatch(syncSource(sourceId)).unwrap()
      showSuccess(t('settings.toastSourceUpdated', { name: sourceName }))
    } finally {
      setSyncingSourceId(null)
    }
  }

  const onSyncAllSources = async () => {
    if (sources.length === 0 || syncingAllSources || syncingSourceId !== null) return
    setSyncingAllSources(true)
    try {
      await dispatch(syncAllSources()).unwrap()
      showSuccess(t('settings.toastAllUpdated'))
      await dispatch(fetchSources())
    } finally {
      setSyncingAllSources(false)
    }
  }

  return {
    syncingSourceId,
    syncingAllSources,
    onSyncSource,
    onSyncAllSources,
  }
}
