import type { ActionReducerMapBuilder } from '@reduxjs/toolkit'
import { APP_LOCALE, isAppLanguage, localeForLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import type { SourcesState } from './sourcesState'
import {
  addSource,
  deleteSource,
  fetchSources,
  syncAllSources,
  syncSource,
} from './sourcesThunks'

export function attachSourcesReducers(builder: ActionReducerMapBuilder<SourcesState>) {
  builder
    .addCase(fetchSources.pending, (state) => {
      state.loading = true
      state.error = null
      state.notice = null
    })
    .addCase(fetchSources.fulfilled, (state, action) => {
      state.loading = false
      state.items = action.payload
    })
    .addCase(fetchSources.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message ?? 'Erro ao carregar fontes.'
    })
    .addCase(addSource.fulfilled, (state, action) => {
      state.error = null
      state.items.unshift(action.payload)
      state.notice = `${action.payload.downloadCount} jogos importados.`
    })
    .addCase(addSource.rejected, (state, action) => {
      state.error = action.error.message ?? 'Erro ao adicionar fonte.'
    })
    .addCase(deleteSource.fulfilled, (state, action) => {
      state.error = null
      state.items = state.items.filter((item) => item.id !== action.payload)
    })
    .addCase(deleteSource.rejected, (state, action) => {
      state.error = action.error.message ?? 'Erro ao remover fonte.'
    })
    .addCase(syncSource.fulfilled, (state, action) => {
      state.error = null
      const item = state.items.find((source) => source.id === action.payload.sourceId)
      if (item) item.downloadCount = action.payload.downloadCount
      state.notice = action.payload.warning ?? `${action.payload.downloadCount.toLocaleString(
        localeForLanguage(isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE),
      )} jogos atualizados.`
    })
    .addCase(syncSource.rejected, (state, action) => {
      state.error = action.error.message ?? 'Erro ao atualizar catálogo.'
    })
    .addCase(syncAllSources.fulfilled, (state, action) => {
      state.error = null
      for (const result of action.payload.synced) {
        const item = state.items.find((source) => source.id === result.sourceId)
        if (item && !result.warning) item.downloadCount = result.downloadCount
      }
      const updated = action.payload.synced.filter((item) => !item.warning).length
      const warnings = action.payload.synced.filter((item) => item.warning).length
      const failed = action.payload.failures.length
      if (failed > 0) {
        state.error = action.payload.failures.map((item) => `${item.sourceName}: ${item.message}`).join(' · ')
      }
      state.notice = failed > 0
        ? `${updated} atualizada(s), ${action.payload.unchangedCount} em dia, ${failed} falha(s).`
        : warnings > 0
          ? `${updated} atualizada(s), ${action.payload.unchangedCount} em dia, ${warnings} aviso(s).`
          : `${updated} atualizada(s), ${action.payload.unchangedCount} já em dia.`
    })
    .addCase(syncAllSources.rejected, (state, action) => {
      state.error = action.error.message ?? 'Erro ao atualizar catálogos.'
    })
}
