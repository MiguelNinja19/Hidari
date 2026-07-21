import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppDispatch } from '../../app/hooks'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { HYDRALINKS_SITE_URL } from '../../shared/config/hydraLinks'
import { APP_LOCALE, isAppLanguage, localeForLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import { useToast } from '../../shared/components/ToastProvider'
import { formatUserError } from '../../shared/utils/formatUserError'
import { addSource } from '../sources/sourcesSlice'

export function useSourceAdding() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { showError, showSuccess } = useToast()
  const [addingSource, setAddingSource] = useState(false)
  const [sourceUrlInput, setSourceUrlInput] = useState('')

  const add = async (url: string, successKey: string, errorKey: string) => {
    setAddingSource(true)
    try {
      const source = await dispatch(addSource({ url })).unwrap()
      setSourceUrlInput('')
      showSuccess(
        t(successKey, {
          count: source.downloadCount.toLocaleString(
            localeForLanguage(isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE),
          ),
        }),
      )
    } catch (error) {
      showError(formatUserError(error, t(errorKey)))
    } finally {
      setAddingSource(false)
    }
  }

  const onAddSourceByUrl = async () => {
    if (addingSource) return
    const url = sourceUrlInput.trim()
    if (!url) return showError(t('settings.toastPasteUrl'))
    await add(url, 'settings.toastGamesAdded', 'settings.toastAddSourceError')
  }

  const onImportSource = async () => {
    if (addingSource) return
    const selected = await open({
      multiple: false,
      filters: [{ name: t('settings.jsonCatalogFilter'), extensions: ['json'] }],
    })
    if (typeof selected === 'string' && selected.toLowerCase().endsWith('.json')) {
      await add(selected.trim(), 'settings.toastGamesImported', 'settings.toastImportError')
    }
  }

  const openExternal = async (action: () => Promise<unknown>, errorKey: string) => {
    try {
      await action()
    } catch (error) {
      showError(formatUserError(error, t(errorKey)))
    }
  }

  return {
    addingSource,
    sourceUrlInput,
    setSourceUrlInput,
    onAddSourceByUrl,
    onImportSource,
    onOpenCatalogsFolder: () =>
      openExternal(() => sourcesApi.openCatalogsCacheFolder(), 'settings.toastOpenCatalogsError'),
    onOpenHydraLinksSite: () =>
      openExternal(
        () => sourcesApi.openExternalUrl(HYDRALINKS_SITE_URL),
        'settings.toastOpenHydraLinksError',
      ),
  }
}
