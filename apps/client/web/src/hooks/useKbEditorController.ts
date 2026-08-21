import type { KbViewMode } from '@components/kb/kbViewMode'
import { useKbDocuments } from '@hooks/useKbDocuments'
import { useLatest } from '@hooks/useLatest'
import { validateKbDocName } from '@lib/validateMarkdownFileName'
import { isDocDirty } from '@stores/kb-store'
import { useEffect, useState } from 'react'

function readInitialMode(): KbViewMode {
  try {
    const raw = localStorage.getItem('kb.editorMode')
    if (raw === 'edit' || raw === 'source')
      return 'source'
    if (raw === 'preview' || raw === 'read')
      return 'read'
    if (raw === 'rich' || raw === 'split')
      return raw
  }
  catch { /* ignore */ }
  return 'source'
}

/**
 * Kb 编辑器 UI 命令层：校验、删除弹窗、快捷键。
 * mutation / error 由 KbStore 拥有，此处不再维护 busy 或 try/catch。
 */
export function useKbEditorController(options?: {
  onSourceModeChange?: (active: boolean) => void
}) {
  const kb = useKbDocuments()
  const {
    activeDoc,
    saving,
    committing,
    mutating,
    mutation,
    localDirty,
    updateLocalName,
    saveDraft,
    commit,
    remove,
    updateMeta,
  } = kb

  const [mode, setMode] = useState<KbViewMode>(readInitialMode)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [nameEditingId, setNameEditingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const dirty = activeDoc
    ? localDirty || isDocDirty(activeDoc)
    : false

  const onSourceModeChange = options?.onSourceModeChange

  function changeMode(next: KbViewMode) {
    setMode(next)
    try {
      localStorage.setItem('kb.editorMode', next)
    }
    catch { /* ignore */ }
  }

  function beginNameEdit() {
    if (!activeDoc)
      return
    setNameDraft(activeDoc.name)
    setNameError(null)
    setNameEditingId(activeDoc.id)
  }

  function cancelNameEdit() {
    setNameError(null)
    setNameEditingId(null)
  }

  function applyNameDraft(): boolean {
    const result = validateKbDocName(nameDraft)
    if (!result.isValid) {
      setNameError(result.message ?? '文件名不合法')
      return false
    }
    updateLocalName(nameDraft)
    setNameError(null)
    setNameEditingId(null)
    return true
  }

  /** 保存/提交前校验文件名；失败时打开标题编辑 */
  function ensureValidActiveName(): boolean {
    if (!activeDoc)
      return false
    const result = validateKbDocName(activeDoc.name)
    if (result.isValid) {
      setNameError(null)
      return true
    }
    setNameError(result.message ?? '文件名不合法')
    setNameDraft(activeDoc.name)
    setNameEditingId(activeDoc.id)
    return false
  }

  async function save() {
    if (!activeDoc || mutating)
      return
    if (!ensureValidActiveName())
      return
    await saveDraft()
  }

  async function submit() {
    if (!activeDoc || mutating)
      return
    if (!ensureValidActiveName())
      return
    await commit()
  }

  async function deleteActive() {
    if (!activeDoc || mutating)
      return
    setDeleteOpen(false)
    await remove(activeDoc.id)
  }

  async function changeTagIds(tagIds: string[]) {
    if (!activeDoc)
      return
    await updateMeta(activeDoc.id, { tagIds })
  }

  const saveRef = useLatest(save)
  const submitRef = useLatest(submit)

  useEffect(() => {
    onSourceModeChange?.(mode === 'source')
  }, [mode, onSourceModeChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (!meta)
        return
      if (e.key === 's') {
        e.preventDefault()
        void saveRef.current()
      }
      else if (e.key === 'Enter') {
        e.preventDefault()
        void submitRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveRef, submitRef])

  function resolveStatusLabel(): string {
    if (!activeDoc)
      return ''
    if (committing)
      return '提交中…'
    if (saving)
      return '保存中…'
    if (mutation === 'delete')
      return '删除中…'
    if (activeDoc.indexingStatus === 'error')
      return `错误：${activeDoc.error ?? '提交失败'}`
    if (activeDoc.indexingStatus === 'indexing')
      return '索引中…'
    if (dirty)
      return '未提交'
    if (activeDoc.indexingStatus === 'completed')
      return '已提交'
    return '草稿'
  }

  return {
    ...kb,
    mode,
    changeMode,
    deleteOpen,
    setDeleteOpen,
    nameEditingId,
    nameDraft,
    setNameDraft,
    nameError,
    setNameError,
    beginNameEdit,
    cancelNameEdit,
    applyNameDraft,
    dirty,
    statusLabel: resolveStatusLabel(),
    save,
    submit,
    deleteActive,
    changeTagIds,
  }
}
