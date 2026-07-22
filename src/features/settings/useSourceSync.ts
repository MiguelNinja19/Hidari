import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { useToast } from '../../shared/components/ToastProvider'
import { fetchSources, syncAllSources } from '../sources/sourcesSlice'

export function useSourceSync() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { showSuccess } = useToast()
  const sources = useAppSelector((state) => state.sources.items)
  const [syncingAllSources, setSyncingAllSources] = useState(false)

  const onSyncAllSources = async () => {
    if (sources.length === 0 || syncingAllSources) return
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
    syncingAllSources,
    onSyncAllSources,
  }
}
