import type { KbNodeRow } from '@apis/kb-api'
import type { DragEvent, FormEvent, KeyboardEvent } from 'react'
import type { KbTreeNode } from './kbTree'
import { cn } from '@lib/utils'
import { isDocDirty } from '@stores/kb-store'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { canMoveFolderTo } from './kbTree'

const DND_MIME = 'application/x-kb-tree'

export type KbTreeDragPayload
  = | { kind: 'folder', id: string }
    | { kind: 'doc', id: string }

function parseDragPayload(raw: string): KbTreeDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed
      && typeof parsed === 'object'
      && 'kind' in parsed
      && 'id' in parsed
      && (parsed.kind === 'folder' || parsed.kind === 'doc')
      && typeof parsed.id === 'string'
    ) {
      return parsed as KbTreeDragPayload
    }
  }
  catch {
    // ignore
  }
  return null
}

function readPayload(e: DragEvent): KbTreeDragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
  return raw ? parseDragPayload(raw) : null
}

export interface KbFileTreeProps {
  nodes: KbNodeRow[]
  tree: KbTreeNode[]
  expanded: Set<string>
  activeId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>
  onMoveDoc: (id: string, parentNodeId: string | null) => Promise<void>
}

export function KbFileTree({
  nodes,
  tree,
  expanded,
  activeId,
  onToggle,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveDoc,
}: KbFileTreeProps) {
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  async function applyDrop(targetParentId: string | null, payload: KbTreeDragPayload) {
    if (payload.kind === 'folder') {
      if (!canMoveFolderTo(nodes, payload.id, targetParentId))
        return
      await onMoveFolder(payload.id, targetParentId)
      return
    }
    const current = findDocParent(tree, payload.id)
    if (current !== undefined && current === targetParentId)
      return
    await onMoveDoc(payload.id, targetParentId)
  }

  function onDragStart(e: DragEvent, payload: KbTreeDragPayload) {
    const raw = JSON.stringify(payload)
    e.dataTransfer.setData(DND_MIME, raw)
    e.dataTransfer.setData('text/plain', raw)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    setDropTarget(null)
  }

  function onFolderDragOver(e: DragEvent, folderId: string) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(folderId)
  }

  function onRootDragOver(e: DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // 文件夹 dragOver 已 stopPropagation；冒泡到此的多为空白/文档 → 移到根
    setDropTarget('root')
  }

  function onDragLeave(e: DragEvent, id: string | 'root') {
    // 仅当离开当前高亮目标时清除
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as Node).contains(related))
      return
    setDropTarget(prev => (prev === id ? null : prev))
  }

  async function onFolderDrop(e: DragEvent, folderId: string) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const payload = readPayload(e)
    if (!payload)
      return
    try {
      await applyDrop(folderId, payload)
    }
    catch {
      // error 已写入 store
    }
  }

  async function onRootDrop(e: DragEvent) {
    e.preventDefault()
    setDropTarget(null)
    const payload = readPayload(e)
    if (!payload)
      return
    try {
      await applyDrop(null, payload)
    }
    catch {
      // error 已写入 store
    }
  }

  async function submitCreate(parentId: string | null) {
    const name = draftName.trim()
    if (!name) {
      cancelDraft()
      return
    }
    try {
      await onCreateFolder(parentId, name)
      cancelDraft()
    }
    catch {
      // keep form open
    }
  }

  async function submitRename(id: string) {
    const name = draftName.trim()
    if (!name) {
      setRenamingId(null)
      return
    }
    try {
      await onRenameFolder(id, name)
      setRenamingId(null)
      setDraftName('')
    }
    catch {
      // keep form open
    }
  }

  async function confirmDelete() {
    if (!pendingDeleteId)
      return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    try {
      await onDeleteFolder(id)
    }
    catch {
      // error 已写入 store
    }
  }

  function cancelDraft() {
    setRenamingId(null)
    setCreatingUnder(undefined)
    setDraftName('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pendingDeleteId && (
        <div className="space-y-2 border-b border-slate-800 bg-slate-900/80 p-2 text-xs text-slate-300">
          <p>
            确定删除该文件夹？子文件夹会一并删除；其中的文档会移到根级，文档本身不会被删除。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600"
              onClick={() => void confirmDelete()}
            >
              删除文件夹
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
              onClick={() => setPendingDeleteId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-2',
          dropTarget === 'root' && 'ring-1 ring-inset ring-sky-500/50',
        )}
        onDragOver={onRootDragOver}
        onDragLeave={e => onDragLeave(e, 'root')}
        onDrop={e => void onRootDrop(e)}
      >
        <div className="mb-1 flex items-center gap-1 px-1">
          <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
            文件
          </span>
          <button
            type="button"
            title="新建根级文件夹"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            onClick={() => {
              if (creatingUnder === null) {
                cancelDraft()
                return
              }
              setCreatingUnder(null)
              setDraftName('新文件夹')
              setRenamingId(null)
            }}
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>

        {creatingUnder === null && (
          <NameDraft
            value={draftName}
            onChange={setDraftName}
            onSubmit={() => void submitCreate(null)}
            onCancel={cancelDraft}
            depth={0}
            submitLabel="创建文件夹"
          />
        )}

        <TreeNodes
          nodes={tree}
          depth={0}
          expanded={expanded}
          activeId={activeId}
          dropTarget={dropTarget}
          renamingId={renamingId}
          creatingUnder={creatingUnder}
          draftName={draftName}
          onToggle={onToggle}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onFolderDragOver={onFolderDragOver}
          onFolderDragLeave={onDragLeave}
          onFolderDrop={onFolderDrop}
          onStartRename={(id, name) => {
            setRenamingId(id)
            setDraftName(name)
            setCreatingUnder(undefined)
          }}
          onStartCreate={(parentId) => {
            setCreatingUnder(parentId)
            setDraftName('新文件夹')
            setRenamingId(null)
            if (!expanded.has(parentId))
              onToggle(parentId)
          }}
          onRequestDelete={setPendingDeleteId}
          onDraftChange={setDraftName}
          onSubmitCreate={parentId => void submitCreate(parentId)}
          onSubmitRename={id => void submitRename(id)}
          onCancelDraft={cancelDraft}
        />
      </div>
    </div>
  )
}

function findDocParent(
  tree: KbTreeNode[],
  docId: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const node of tree) {
    if (node.kind === 'doc' && node.id === docId)
      return parentId
    if (node.kind === 'folder') {
      const found = findDocParent(node.children, docId, node.id)
      if (found !== undefined)
        return found
    }
  }
  return undefined
}

function NameDraft({
  value,
  onChange,
  onSubmit,
  onCancel,
  depth,
  submitLabel = '确定',
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  depth: number
  submitLabel?: string
}) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  function onForm(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={onForm}
      className="mb-0.5 flex items-center gap-1 py-0.5"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <Folder className="size-3.5 shrink-0 text-slate-500" />
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-sm text-slate-100 outline-none focus:border-sky-500"
      />
      <button
        type="submit"
        title={submitLabel}
        className="shrink-0 rounded p-1 text-sky-400 hover:bg-slate-800 hover:text-sky-300"
      >
        <span className="sr-only">{submitLabel}</span>
        <span className="text-xs font-medium">✓</span>
      </button>
      <button
        type="button"
        title="取消"
        onClick={onCancel}
        className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
      >
        <X className="size-3.5" />
      </button>
    </form>
  )
}

function TreeNodes({
  nodes,
  depth,
  expanded,
  activeId,
  dropTarget,
  renamingId,
  creatingUnder,
  draftName,
  onToggle,
  onSelect,
  onDragStart,
  onDragEnd,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  onStartRename,
  onStartCreate,
  onRequestDelete,
  onDraftChange,
  onSubmitCreate,
  onSubmitRename,
  onCancelDraft,
}: {
  nodes: KbTreeNode[]
  depth: number
  expanded: Set<string>
  activeId: string | null
  dropTarget: string | 'root' | null
  renamingId: string | null
  creatingUnder: string | null | undefined
  draftName: string
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onDragStart: (e: DragEvent, payload: KbTreeDragPayload) => void
  onDragEnd: () => void
  onFolderDragOver: (e: DragEvent, folderId: string) => void
  onFolderDragLeave: (e: DragEvent, id: string | 'root') => void
  onFolderDrop: (e: DragEvent, folderId: string) => void
  onStartRename: (id: string, name: string) => void
  onStartCreate: (parentId: string) => void
  onRequestDelete: (id: string) => void
  onDraftChange: (v: string) => void
  onSubmitCreate: (parentId: string | null) => void
  onSubmitRename: (id: string) => void
  onCancelDraft: () => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const open = expanded.has(node.id)
          const over = dropTarget === node.id
          return (
            <div key={`f-${node.id}`}>
              {renamingId === node.id
                ? (
                    <NameDraft
                      value={draftName}
                      onChange={onDraftChange}
                      onSubmit={() => onSubmitRename(node.id)}
                      onCancel={onCancelDraft}
                      depth={depth}
                    />
                  )
                : (
                    <div
                      draggable
                      onDragStart={e => onDragStart(e, { kind: 'folder', id: node.id })}
                      onDragEnd={onDragEnd}
                      onDragOver={e => onFolderDragOver(e, node.id)}
                      onDragLeave={e => onFolderDragLeave(e, node.id)}
                      onDrop={e => onFolderDrop(e, node.id)}
                      className={cn(
                        'group flex w-full items-center gap-0.5 rounded-md text-sm text-slate-300',
                        over && 'bg-sky-950/60 ring-1 ring-inset ring-sky-500/40',
                        !over && 'hover:bg-slate-800',
                      )}
                      style={{ paddingLeft: 4 + depth * 12 }}
                    >
                      <button
                        type="button"
                        onClick={() => onToggle(node.id)}
                        className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
                      >
                        {open
                          ? <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
                          : <ChevronRight className="size-3.5 shrink-0 text-slate-500" />}
                        {open
                          ? <FolderOpen className="size-3.5 shrink-0 text-amber-500/80" />
                          : <Folder className="size-3.5 shrink-0 text-amber-500/80" />}
                        <span className="truncate">{node.name}</span>
                      </button>
                      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          title="新建子文件夹"
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                          onClick={() => onStartCreate(node.id)}
                        >
                          <FolderPlus className="size-3" />
                        </button>
                        <button
                          type="button"
                          title="重命名"
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                          onClick={() => onStartRename(node.id, node.name)}
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          title="删除文件夹"
                          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400"
                          onClick={() => onRequestDelete(node.id)}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  )}
              {open && (
                <>
                  {creatingUnder === node.id && (
                    <NameDraft
                      value={draftName}
                      onChange={onDraftChange}
                      onSubmit={() => onSubmitCreate(node.id)}
                      onCancel={onCancelDraft}
                      depth={depth + 1}
                    />
                  )}
                  <TreeNodes
                    nodes={node.children}
                    depth={depth + 1}
                    expanded={expanded}
                    activeId={activeId}
                    dropTarget={dropTarget}
                    renamingId={renamingId}
                    creatingUnder={creatingUnder}
                    draftName={draftName}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onFolderDragOver={onFolderDragOver}
                    onFolderDragLeave={onFolderDragLeave}
                    onFolderDrop={onFolderDrop}
                    onStartRename={onStartRename}
                    onStartCreate={onStartCreate}
                    onRequestDelete={onRequestDelete}
                    onDraftChange={onDraftChange}
                    onSubmitCreate={onSubmitCreate}
                    onSubmitRename={onSubmitRename}
                    onCancelDraft={onCancelDraft}
                  />
                </>
              )}
            </div>
          )
        }

        const dirty = isDocDirty(node.doc)
        const selected = node.id === activeId
        return (
          <button
            key={`d-${node.id}`}
            type="button"
            draggable
            onDragStart={e => onDragStart(e, { kind: 'doc', id: node.id })}
            onDragEnd={onDragEnd}
            onClick={() => onSelect(node.id)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-800',
              selected ? 'bg-slate-800 text-slate-100' : 'text-slate-300',
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <FileText className="size-3.5 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {dirty && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-400"
                title="有未提交改动"
              />
            )}
          </button>
        )
      })}
    </>
  )
}
