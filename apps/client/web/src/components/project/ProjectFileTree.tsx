import type { DragEvent, FormEvent, KeyboardEvent } from 'react'
import type { ProjectTreeNode } from './projectTree'
import { cn } from '@lib/utils'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  ListTodo,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'

const DND_MIME = 'application/x-project-tree'

export type ProjectDragPayload
  = | { kind: 'folder', id: string }
    | { kind: 'text', id: string, dirId: string, filename: string }

function parsePayload(raw: string): ProjectDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as ProjectDragPayload
    if (parsed.kind === 'folder' && typeof parsed.id === 'string')
      return parsed
    if (parsed.kind === 'text' && typeof parsed.id === 'string')
      return parsed
  }
  catch {
    // ignore
  }
  return null
}

export type ProjectSelection
  = | { kind: 'folder', id: string }
    | { kind: 'text', id: string }
    | { kind: 'doc', id: string }
    | { kind: 'task', id: string }

interface ProjectFileTreeProps {
  root: Extract<ProjectTreeNode, { kind: 'folder' }>
  selected: ProjectSelection | null
  onSelect: (sel: ProjectSelection) => void
  onCreateFolder: (parentId: string, name: string) => Promise<void>
  onRenameFolder: (id: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onMoveFolder: (id: string, parentId: string) => Promise<void>
  onCreateText: (dirId: string, filename: string) => Promise<void>
  onDeleteText: (id: string) => Promise<void>
  onMoveText: (id: string, dirId: string, filename: string) => Promise<void>
  onMarkSkill: (dirId: string) => Promise<void>
  onUnmarkSkill: (skillId: string) => Promise<void>
}

export function ProjectFileTree(props: ProjectFileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([props.root.id]))
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null)
  const [creatingFileUnder, setCreatingFileUnder] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id))
        next.delete(id)
      else
        next.add(id)
      return next
    })
  }

  function ensureOpen(id: string) {
    setExpanded((prev) => {
      if (prev.has(id))
        return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function cancelDraft() {
    setRenamingId(null)
    setCreatingUnder(null)
    setCreatingFileUnder(null)
  }

  async function applyDrop(targetDirId: string, payload: ProjectDragPayload) {
    if (payload.kind === 'folder') {
      if (payload.id === targetDirId)
        return
      await props.onMoveFolder(payload.id, targetDirId)
      return
    }
    if (payload.dirId === targetDirId)
      return
    await props.onMoveText(payload.id, targetDirId, payload.filename)
  }

  async function confirmDelete() {
    if (!pendingDeleteId)
      return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    await props.onDeleteFolder(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pendingDeleteId && (
        <div className="space-y-2 border-b border-border bg-muted p-2 text-xs text-foreground">
          <p>确定删除该文件夹？须先清空子文件夹与挂载（空校验，不级联）。</p>
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
              className="rounded bg-muted px-2 py-1 hover:bg-accent"
              onClick={() => setPendingDeleteId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        <div className="mb-1 flex items-center gap-1 px-1">
          <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            文件
          </span>
          <button
            type="button"
            title="新建子文件夹"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              setCreatingUnder(props.root.id)
              setDraft('新文件夹')
              setRenamingId(null)
              setCreatingFileUnder(null)
              ensureOpen(props.root.id)
            }}
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>

        <FolderBlock
          node={props.root}
          depth={0}
          isRoot
          expanded={expanded}
          selected={props.selected}
          dropTarget={dropTarget}
          renamingId={renamingId}
          creatingUnder={creatingUnder}
          creatingFileUnder={creatingFileUnder}
          draft={draft}
          onToggle={toggle}
          onSelect={props.onSelect}
          onDropTarget={setDropTarget}
          onApplyDrop={applyDrop}
          onStartRename={(id, name) => {
            setRenamingId(id)
            setDraft(name)
            setCreatingUnder(null)
            setCreatingFileUnder(null)
          }}
          onStartCreate={(id) => {
            setCreatingUnder(id)
            setDraft('新文件夹')
            setRenamingId(null)
            setCreatingFileUnder(null)
            ensureOpen(id)
          }}
          onStartCreateFile={(id) => {
            setCreatingFileUnder(id)
            setDraft('notes.md')
            setRenamingId(null)
            setCreatingUnder(null)
            ensureOpen(id)
          }}
          onDraftChange={setDraft}
          onSubmitRename={async (id) => {
            const name = draft.trim()
            setRenamingId(null)
            if (name)
              await props.onRenameFolder(id, name)
          }}
          onSubmitCreate={async (parentId) => {
            const name = draft.trim()
            setCreatingUnder(null)
            if (name)
              await props.onCreateFolder(parentId, name)
          }}
          onSubmitCreateFile={async (dirId) => {
            const name = draft.trim()
            setCreatingFileUnder(null)
            if (name)
              await props.onCreateText(dirId, name)
          }}
          onCancelDraft={cancelDraft}
          onRequestDelete={setPendingDeleteId}
          onDeleteText={props.onDeleteText}
          onMarkSkill={props.onMarkSkill}
          onUnmarkSkill={props.onUnmarkSkill}
        />
      </div>
    </div>
  )
}

function NameDraft({
  value,
  onChange,
  onSubmit,
  onCancel,
  depth,
  submitLabel = '确定',
  icon = 'folder',
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  depth: number
  submitLabel?: string
  icon?: 'folder' | 'file'
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
      {icon === 'file'
        ? <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        : <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm text-foreground outline-none focus:border-sky-500"
      />
      <button
        type="submit"
        title={submitLabel}
        className="shrink-0 rounded p-1 text-sky-700 hover:bg-accent hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
      >
        <span className="sr-only">{submitLabel}</span>
        <span className="text-xs font-medium">✓</span>
      </button>
      <button
        type="button"
        title="取消"
        onClick={onCancel}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </form>
  )
}

function FolderBlock(p: {
  node: Extract<ProjectTreeNode, { kind: 'folder' }>
  depth: number
  isRoot?: boolean
  expanded: Set<string>
  selected: ProjectSelection | null
  dropTarget: string | null
  renamingId: string | null
  creatingUnder: string | null
  creatingFileUnder: string | null
  draft: string
  onToggle: (id: string) => void
  onSelect: (sel: ProjectSelection) => void
  onDropTarget: (id: string | null) => void
  onApplyDrop: (targetDirId: string, payload: ProjectDragPayload) => Promise<void>
  onStartRename: (id: string, name: string) => void
  onStartCreate: (id: string) => void
  onStartCreateFile: (id: string) => void
  onDraftChange: (v: string) => void
  onSubmitRename: (id: string) => Promise<void>
  onSubmitCreate: (parentId: string) => Promise<void>
  onSubmitCreateFile: (dirId: string) => Promise<void>
  onCancelDraft: () => void
  onRequestDelete: (id: string) => void
  onDeleteText: (id: string) => Promise<void>
  onMarkSkill: (dirId: string) => Promise<void>
  onUnmarkSkill: (skillId: string) => Promise<void>
}) {
  const { node, depth } = p
  const open = p.expanded.has(node.id)
  const active = p.selected?.kind === 'folder' && p.selected.id === node.id
  const over = p.dropTarget === node.id

  function startDrag(e: DragEvent, payload: ProjectDragPayload) {
    const raw = JSON.stringify(payload)
    e.dataTransfer.setData(DND_MIME, raw)
    e.dataTransfer.setData('text/plain', raw)
    e.dataTransfer.effectAllowed = 'move'
  }

  if (p.renamingId === node.id) {
    return (
      <div>
        <NameDraft
          value={p.draft}
          onChange={p.onDraftChange}
          onSubmit={() => void p.onSubmitRename(node.id)}
          onCancel={p.onCancelDraft}
          depth={depth}
          submitLabel="重命名"
        />
        {open && (
          <FolderChildren {...p} />
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-0.5 rounded-md text-sm text-foreground',
          over && 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40',
          !over && (active ? 'bg-accent' : 'hover:bg-accent'),
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable={!p.isRoot}
        onDragStart={e => !p.isRoot && startDrag(e, { kind: 'folder', id: node.id })}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          p.onDropTarget(node.id)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          p.onDropTarget(null)
          const payload = parsePayload(e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain'))
          if (payload)
            void p.onApplyDrop(node.id, payload)
        }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
          onClick={() => {
            p.onToggle(node.id)
            p.onSelect({ kind: 'folder', id: node.id })
          }}
        >
          {open
            ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {open
            ? <FolderOpen className="size-3.5 shrink-0 text-amber-500/80" />
            : <Folder className="size-3.5 shrink-0 text-amber-500/80" />}
          <span className="truncate">{node.name}</span>
          {node.skill && (
            <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
              {node.skill.code}
            </span>
          )}
        </button>
        <div className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            title="新建子文件夹"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => p.onStartCreate(node.id)}
          >
            <FolderPlus className="size-3" />
          </button>
          <button
            type="button"
            title="新建文本"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => p.onStartCreateFile(node.id)}
          >
            <FileText className="size-3" />
          </button>
          {node.skill
            ? (
                <button
                  type="button"
                  title="卸标 Skill"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void p.onUnmarkSkill(node.skill!.id)}
                >
                  <Sparkles className="size-3 text-sky-600" />
                </button>
              )
            : !p.isRoot && (
                <button
                  type="button"
                  title="升级为 Skill"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void p.onMarkSkill(node.id)}
                >
                  <Sparkles className="size-3" />
                </button>
              )}
          <button
            type="button"
            title="重命名"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => p.onStartRename(node.id, node.name)}
          >
            <Pencil className="size-3" />
          </button>
          {!p.isRoot && (
            <button
              type="button"
              title="删除文件夹"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              onClick={() => p.onRequestDelete(node.id)}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      {open && <FolderChildren {...p} />}
    </div>
  )
}

function FolderChildren(p: {
  node: Extract<ProjectTreeNode, { kind: 'folder' }>
  depth: number
  expanded: Set<string>
  selected: ProjectSelection | null
  dropTarget: string | null
  renamingId: string | null
  creatingUnder: string | null
  creatingFileUnder: string | null
  draft: string
  onToggle: (id: string) => void
  onSelect: (sel: ProjectSelection) => void
  onDropTarget: (id: string | null) => void
  onApplyDrop: (targetDirId: string, payload: ProjectDragPayload) => Promise<void>
  onStartRename: (id: string, name: string) => void
  onStartCreate: (id: string) => void
  onStartCreateFile: (id: string) => void
  onDraftChange: (v: string) => void
  onSubmitRename: (id: string) => Promise<void>
  onSubmitCreate: (parentId: string) => Promise<void>
  onSubmitCreateFile: (dirId: string) => Promise<void>
  onCancelDraft: () => void
  onRequestDelete: (id: string) => void
  onDeleteText: (id: string) => Promise<void>
  onMarkSkill: (dirId: string) => Promise<void>
  onUnmarkSkill: (skillId: string) => Promise<void>
}) {
  const { node, depth } = p

  function startDrag(e: DragEvent, payload: ProjectDragPayload) {
    const raw = JSON.stringify(payload)
    e.dataTransfer.setData(DND_MIME, raw)
    e.dataTransfer.setData('text/plain', raw)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      {p.creatingUnder === node.id && (
        <NameDraft
          value={p.draft}
          onChange={p.onDraftChange}
          onSubmit={() => void p.onSubmitCreate(node.id)}
          onCancel={p.onCancelDraft}
          depth={depth + 1}
          submitLabel="创建文件夹"
        />
      )}
      {p.creatingFileUnder === node.id && (
        <NameDraft
          value={p.draft}
          onChange={p.onDraftChange}
          onSubmit={() => void p.onSubmitCreateFile(node.id)}
          onCancel={p.onCancelDraft}
          depth={depth + 1}
          submitLabel="创建文件"
          icon="file"
        />
      )}
      {node.children.map((child) => {
        if (child.kind === 'folder') {
          return (
            <FolderBlock
              key={child.id}
              {...p}
              node={child}
              depth={depth + 1}
              isRoot={false}
            />
          )
        }
        const leafActive = p.selected?.kind === child.kind && p.selected.id === child.id
        return (
          <div
            key={`${child.kind}:${child.id}`}
            className={cn(
              'group flex items-center gap-0.5 rounded-md text-sm',
              leafActive ? 'bg-accent' : 'hover:bg-accent',
            )}
            style={{ paddingLeft: 4 + (depth + 1) * 12 }}
            draggable={child.kind === 'text'}
            onDragStart={e => child.kind === 'text' && startDrag(e, { kind: 'text', id: child.id, dirId: child.dirId, filename: child.name })}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
              onClick={() => p.onSelect({ kind: child.kind, id: child.id })}
            >
              {child.kind === 'task'
                ? <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
                : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{child.name}</span>
            </button>
            {child.kind === 'text' && (
              <div className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  title="删除文件"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  onClick={() => void p.onDeleteText(child.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
