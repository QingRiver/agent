import { GtdStore } from '@stores/gtd-store'
import { useAtomValue } from 'jotai'

export function useGtd() {
  const doc = useAtomValue(GtdStore.docAtom)
  const selection = useAtomValue(GtdStore.selectionAtom)
  const selectedTaskId = useAtomValue(GtdStore.selectedTaskIdAtom)
  const selectedProjectId = useAtomValue(GtdStore.selectedProjectIdAtom)
  const isLoading = useAtomValue(GtdStore.isLoadingAtom)
  const saving = useAtomValue(GtdStore.savingAtom)
  const error = useAtomValue(GtdStore.errorAtom)

  return {
    doc,
    selection,
    selectedTaskId,
    selectedProjectId,
    isLoading,
    saving,
    error,
    load: GtdStore.load,
    setSelection: GtdStore.setSelection,
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
    addPerspective: GtdStore.addPerspective,
    patchPerspective: GtdStore.patchPerspective,
    removePerspective: GtdStore.removePerspective,
    addProject: GtdStore.addProject,
    patchProject: GtdStore.patchProject,
    holdProject: GtdStore.holdProject,
    resumeProject: GtdStore.resumeProject,
    markProjectReviewed: GtdStore.markProjectReviewed,
    removeProject: GtdStore.removeProject,
    reorderProject: GtdStore.reorderProject,
    addTag: GtdStore.addTag,
    patchTag: GtdStore.patchTag,
    removeTag: GtdStore.removeTag,
    reorderTag: GtdStore.reorderTag,
    addFolder: GtdStore.addFolder,
    reorderFolder: GtdStore.reorderFolder,
  }
}
