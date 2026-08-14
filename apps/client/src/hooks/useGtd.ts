import { GtdStore } from '@stores/gtd-store'
import { useAtomValue } from 'jotai'

export function useGtd() {
  const rowStore = useAtomValue(GtdStore.rowStoreAtom)
  const selection = useAtomValue(GtdStore.selectionAtom)
  const forecastStrip = useAtomValue(GtdStore.forecastStripAtom)
  const forecastSignals = useAtomValue(GtdStore.forecastSignalsAtom)
  const viewOptionsMap = useAtomValue(GtdStore.viewOptionsAtom)
  const selectedTaskId = useAtomValue(GtdStore.selectedTaskIdAtom)
  const isLoading = useAtomValue(GtdStore.isLoadingAtom)
  const syncStatus = useAtomValue(GtdStore.syncStatusAtom)
  const syncLocked = useAtomValue(GtdStore.syncLockedAtom)
  const error = useAtomValue(GtdStore.errorAtom)

  return {
    rowStore,
    selection,
    forecastStrip,
    forecastSignals,
    viewOptionsMap,
    selectedTaskId,
    isLoading,
    syncStatus,
    syncLocked,
    error,
    load: GtdStore.load,
    recoverFromReject: GtdStore.recoverFromReject,
    exportDocument: GtdStore.exportDocument,
    importDocument: GtdStore.importDocument,
    setSelection: GtdStore.setSelection,
    toggleForecastStripSegment: GtdStore.toggleForecastStripSegment,
    patchForecastSignals: GtdStore.patchForecastSignals,
    patchViewOptions: GtdStore.patchViewOptions,
    setTaskPlanned: GtdStore.setTaskPlanned,
    selectTask: GtdStore.selectTask,
    addInboxTask: GtdStore.addInboxTask,
    addProjectTask: GtdStore.addProjectTask,
    addChildTask: GtdStore.addChildTask,
    indentTask: GtdStore.indentTask,
    outdentTask: GtdStore.outdentTask,
    setTaskGroupType: GtdStore.setTaskGroupType,
    reorderTask: GtdStore.reorderTask,
    moveTask: GtdStore.moveTask,
    completeTask: GtdStore.completeTask,
    dropTask: GtdStore.dropTask,
    reopenTask: GtdStore.reopenTask,
    restoreTask: GtdStore.restoreTask,
    restoreFromTrash: GtdStore.restoreFromTrash,
    deleteTaskLogical: GtdStore.deleteTaskLogical,
    purgeTrash: GtdStore.purgeTrash,
    toggleFlag: GtdStore.toggleFlag,
    patchTask: GtdStore.patchTask,
    setTaskRepeat: GtdStore.setTaskRepeat,
    setTaskTags: GtdStore.setTaskTags,
    addPerspective: GtdStore.addPerspective,
    patchPerspective: GtdStore.patchPerspective,
    removePerspective: GtdStore.removePerspective,
  }
}
