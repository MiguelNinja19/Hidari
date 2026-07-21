import { useCallback, useState } from 'react'
import type { LibraryEntry } from './types'

export function useLibraryDeletePrompt(deletingLibraryKey: string | null) {
  const [pendingDeleteItem, setPendingDeleteItem] = useState<LibraryEntry | null>(null)

  const clearDeletePrompt = useCallback(() => {
    setPendingDeleteItem(null)
  }, [])

  const handleDeleteLibraryItem = useCallback((item: LibraryEntry) => {
    setPendingDeleteItem(item)
  }, [])

  const handleCancelDeleteLibraryItem = useCallback(() => {
    if (deletingLibraryKey) return
    clearDeletePrompt()
  }, [clearDeletePrompt, deletingLibraryKey])

  return {
    pendingDeleteItem,
    handleDeleteLibraryItem,
    handleCancelDeleteLibraryItem,
    clearDeletePrompt,
  }
}
