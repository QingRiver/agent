import { KbStore } from '@stores/kb-store'
import { useAtomValue } from 'jotai'

export function useKbDocuments() {
  const nodes = useAtomValue(KbStore.nodesAtom)
  const docs = useAtomValue(KbStore.docsAtom)
  const filteredDocs = useAtomValue(KbStore.filteredDocsAtom)
  const tags = useAtomValue(KbStore.tagsAtom)
  const selectedTags = useAtomValue(KbStore.selectedTagsAtom)
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
    selectedTags,
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
    setSelectedTags: KbStore.setSelectedTags,
    updateLocalContent: KbStore.updateLocalContent,
    updateLocalName: KbStore.updateLocalName,
    saveDraft: KbStore.saveDraft,
    commit: KbStore.commit,
    createBlank: KbStore.createBlank,
    remove: KbStore.remove,
  }
}
