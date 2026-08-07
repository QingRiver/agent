import { GtdStore } from '@stores/gtd-store'
import { useAtomValue } from 'jotai'

export function useGtd() {
  const rowStore = useAtomValue(GtdStore.rowStoreAtom)
  const rows = useAtomValue(GtdStore.rowsAtom)
  const selection = useAtomValue(GtdStore.selectionAtom)
  const forecastStrip = useAtomValue(GtdStore.forecastStripAtom)
  const forecastSignals = useAtomValue(GtdStore.forecastSignalsAtom)
  const selectedTaskId = useAtomValue(GtdStore.selectedTaskIdAtom)
  const selectedProjectId = useAtomValue(GtdStore.selectedProjectIdAtom)
  const isLoading = useAtomValue(GtdStore.isLoadingAtom)
  const saving = useAtomValue(GtdStore.savingAtom)
  const syncStatus = useAtomValue(GtdStore.syncStatusAtom)
  const syncLocked = useAtomValue(GtdStore.syncLockedAtom)
  const error = useAtomValue(GtdStore.errorAtom)

  return {
    rowStore,
    rows,
    selection,
    forecastStrip,
    forecastSignals,
    selectedTaskId,
    selectedProjectId,
    isLoading,
    saving,
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
    setTaskPlanned: GtdStore.setTaskPlanned,
    selectTask: GtdStore.selectTask,
    selectProjectForInspector: GtdStore.selectProjectForInspector,
    addInboxTask: GtdStore.addInboxTask,
    addProjectTask: GtdStore.addProjectTask,
    addChildTask: GtdStore.addChildTask,
    indentTask: GtdStore.indentTask,
    outdentTask: GtdStore.outdentTask,
    setTaskGroupType: GtdStore.setTaskGroupType,
    reorderTask: GtdStore.reorderTask,
    completeTask: GtdStore.completeTask,
    dropTask: GtdStore.dropTask,
    reopenTask: GtdStore.reopenTask,
    restoreTask: GtdStore.restoreTask,
    deleteTaskLogical: GtdStore.deleteTaskLogical,
    toggleFlag: GtdStore.toggleFlag,
    patchTask: GtdStore.patchTask,
    setTaskRepeat: GtdStore.setTaskRepeat,
    setTaskTags: GtdStore.setTaskTags,
    addPerspective: GtdStore.addPerspective,
    patchPerspective: GtdStore.patchPerspective,
    removePerspective: GtdStore.removePerspective,
    addProject: GtdStore.addProject,
    renameDir: GtdStore.renameDir,
    moveDir: GtdStore.moveDir,
    removeProject: GtdStore.removeProject,
    reorderProject: GtdStore.reorderProject,
    addTag: GtdStore.addTag,
    patchTag: GtdStore.patchTag,
    removeTag: GtdStore.removeTag,
    addFolder: GtdStore.addFolder,
    removeFolder: GtdStore.removeFolder,
    reorderFolder: GtdStore.reorderFolder,
  }
}
