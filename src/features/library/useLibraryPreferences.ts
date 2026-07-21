import { useCallback, useEffect, useState } from 'react'
import type { NavTab } from '../../layout/types'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  parseLibrarySort,
  SETTING_KEY,
  type LibrarySort,
} from '../../shared/config/appSettings'

export function useLibraryPreferences(activeTab: NavTab) {
  const [libraryFilter, setLibraryFilter] = useState('')
  const [librarySort, setLibrarySortState] = useState<LibrarySort>('title-asc')

  useEffect(() => {
    if (activeTab !== 'library') return
    void sourcesApi.getAppSetting(SETTING_KEY.librarySort)
      .then((value) => setLibrarySortState(parseLibrarySort(value)))
      .catch(() => {
        // Tauri indisponível
      })
  }, [activeTab])

  const setLibrarySort = useCallback((value: LibrarySort) => {
    setLibrarySortState(value)
    void sourcesApi.setAppSetting(SETTING_KEY.librarySort, value).catch(() => {
      // ignora falha de persistência
    })
  }, [])

  return { libraryFilter, setLibraryFilter, librarySort, setLibrarySort }
}
