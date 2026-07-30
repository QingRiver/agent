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
  const mutation = useAtomValue(KbStore.mutationAtom)
  const saving = useAtomValue(KbStore.savingAtom)
  const committing = useAtomValue(KbStore.committingAtom)
  const mutating = useAtomValue(KbStore.mutatingAtom)
  const error = useAtomValue(KbStore.errorAtom)
  const localDirty = useAtomValue(KbStore.localDirtyAtom)

  return {
    /** 文档树节点列表 */
    nodes,
    /** 文档列表 */
    docs,
    /** 过滤后的文档列表 */
    filteredDocs,
    /** 标签列表 */
    tags,
    /** 选中的标签ID列表 */
    selectedTagIds,
    /** 当前激活的文档ID，可能为null */
    activeId,
    /** 当前激活的文档，可能为null */
    activeDoc,
    /** 是否正在加载 */
    isLoading,
    /** 当前正在进行的操作类型，可能为null */
    mutation,
    /** 是否正在保存 */
    saving,
    /** 是否正在提交 */
    committing,
    /** 是否正在执行操作 */
    mutating,
    /** 当前错误信息，可能为null */
    error,
    /** 是否本地有未保存的修改 */
    localDirty,
    /** 刷新文档列表 */
    refresh: KbStore.refresh,
    /** 选择文档 */
    select: KbStore.select,
    /** 切换标签 */
    toggleTag: KbStore.toggleTag,
    /** 设置选中的标签ID列表 */
    setSelectedTagIds: KbStore.setSelectedTagIds,
    /** 更新本地内容 */
    updateLocalContent: KbStore.updateLocalContent,
    /** 更新本地名称 */
    updateLocalName: KbStore.updateLocalName,
    /** 保存草稿 */
    saveDraft: KbStore.saveDraft,
    /** 更新元数据 */
    updateMeta: KbStore.updateMeta,
    /** 提交 */
    commit: KbStore.commit,
    /** 创建空白文档 */
    createBlank: KbStore.createBlank,
    /** 删除文档 */
    remove: KbStore.remove,
    /** 创建文件夹 */
    createFolder: KbStore.createFolder,
    /** 重命名文件夹 */
    renameFolder: KbStore.renameFolder,
    /** 移动文件夹 */
    moveFolder: KbStore.moveFolder,
    /** 删除文件夹 */
    removeFolder: KbStore.removeFolder,
    /** 移动文档 */
    moveDoc: KbStore.moveDoc,
  }
}
