import { KbStore } from '@stores/kb-store'
import { useAtomValue } from 'jotai'

export function useKbDocuments() {
  const nodes = useAtomValue(KbStore.nodesAtom)
  const docs = useAtomValue(KbStore.docsAtom)
  const filteredDocs = useAtomValue(KbStore.filteredDocsAtom)
  const tags = useAtomValue(KbStore.tagsAtom)
  const selectedTagIds = useAtomValue(KbStore.selectedTagIdsAtom)
  const activeId = useAtomValue(KbStore.activeIdAtom)
  const activeDoc = useAtomValue(KbStore.activeDocAtom)
  const isLoading = useAtomValue(KbStore.isLoadingAtom)
  const saving = useAtomValue(KbStore.savingAtom)
  const committing = useAtomValue(KbStore.committingAtom)
  const error = useAtomValue(KbStore.errorAtom)
  const localDirty = useAtomValue(KbStore.localDirtyAtom)

  return {
    nodes,
    docs,
    filteredDocs,
    tags,
    selectedTagIds,
    activeId,
    activeDoc,
    isLoading,
    saving,
    committing,
    error,
    localDirty,
    refresh: KbStore.refresh,
    select: KbStore.select,
    toggleTag: KbStore.toggleTag,
    setSelectedTagIds: KbStore.setSelectedTagIds,
    updateLocalContent: KbStore.updateLocalContent,
    updateLocalName: KbStore.updateLocalName,
    saveDraft: KbStore.saveDraft,
    updateMeta: KbStore.updateMeta,
    commit: KbStore.commit,
    createBlank: KbStore.createBlank,
    remove: KbStore.remove,
    createFolder: KbStore.createFolder,
    renameFolder: KbStore.renameFolder,
    moveFolder: KbStore.moveFolder,
    removeFolder: KbStore.removeFolder,
    moveDoc: KbStore.moveDoc,
  }
}
