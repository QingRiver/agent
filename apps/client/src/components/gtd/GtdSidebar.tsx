import type { FolderTree, PerspectiveInput, TagTree } from '@agent/gtd'
import type { GtdSelection } from '@stores/gtd-store'
import type { ReactNode } from 'react'
import { buildFolderTree, buildTagTree, builtinPerspectives, EXPLICIT_STATUS } from '@agent/gtd'
import { GtdPerspectiveEditor } from '@components/gtd/GtdPerspectiveEditor'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGtd } from '@hooks/useGtd'
import { cn } from '@lib/utils'
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Flag,
  Folder,
  GripVertical,
  Inbox,
  Layers,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  Telescope,
  Upload,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

const PERSPECTIVE_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  projects: Layers,
  tags: Tag,
  forecast: CalendarDays,
  flagged: Flag,
  review: Telescope,
  completed: CheckCircle2,
  predicted: Sparkles,
}

function NavItem({
  active,
  icon: Icon,
  label,
  onClick,
  indent = 0,
  dragHandle,
}: {
  active: boolean
  icon?: typeof Inbox
  label: string
  onClick: () => void
  indent?: number
  dragHandle?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-accent-foreground',
      )}
      style={{ paddingLeft: `${8 + indent * 12}px` }}
    >
      {dragHandle}
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
    </button>
  )
}

function SortableNavItem({
  sortableId,
  ...props
}: Parameters<typeof NavItem>[0] & { sortableId: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId })
  return (
    <div
      ref={setNodeRef}
      className={cn(isDragging && 'opacity-50')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <NavItem
        {...props}
        dragHandle={(
          <span
            className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            title="拖动排序"
            onClick={e => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </span>
        )}
      />
    </div>
  )
}

function FolderNodes({
  nodes,
  depth,
  selection,
  projects,
  onSelect,
}: {
  nodes: FolderTree['roots']
  depth: number
  selection: GtdSelection
  projects: Array<{ id: string, name: string, folderId: string | null, status: string }>
  onSelect: (sel: GtdSelection) => void
}) {
  return (
    <>
      <SortableContext
        items={nodes.map(node => `folder:${node.folder.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {nodes.map((node) => {
          const folderProjects = projects.filter(p => p.folderId === node.folder.id)
          return (
            <div key={node.folder.id}>
              <SortableNavItem
                sortableId={`folder:${node.folder.id}`}
                active={selection.kind === 'folder' && selection.id === node.folder.id}
                icon={Folder}
                label={node.folder.data.name}
                indent={depth}
                onClick={() => onSelect({ kind: 'folder', id: node.folder.id })}
              />
              <SortableContext
                items={folderProjects.map(p => `project:${p.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {folderProjects.map(p => (
                  <SortableNavItem
                    key={p.id}
                    sortableId={`project:${p.id}`}
                    active={selection.kind === 'project' && selection.id === p.id}
                    icon={Layers}
                    label={p.name}
                    indent={depth + 1}
                    onClick={() => onSelect({ kind: 'project', id: p.id })}
                  />
                ))}
              </SortableContext>
              <FolderNodes
                nodes={node.children}
                depth={depth + 1}
                selection={selection}
                projects={projects}
                onSelect={onSelect}
              />
            </div>
          )
        })}
      </SortableContext>
    </>
  )
}

function TagNodes({
  nodes,
  depth,
  selection,
  onSelect,
}: {
  nodes: TagTree['roots']
  depth: number
  selection: GtdSelection
  onSelect: (sel: GtdSelection) => void
}) {
  return (
    <>
      <SortableContext
        items={nodes.map(node => `tag:${node.tag.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {nodes.map(node => (
          <div key={node.tag.id}>
            <SortableNavItem
              sortableId={`tag:${node.tag.id}`}
              active={selection.kind === 'tag' && selection.id === node.tag.id}
              icon={Tag}
              label={node.tag.data.name}
              indent={depth}
              onClick={() => onSelect({ kind: 'tag', id: node.tag.id })}
            />
            <TagNodes
              nodes={node.children}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
            />
          </div>
        ))}
      </SortableContext>
    </>
  )
}

export function GtdSidebar() {
  const {
    rowStore,
    selection,
    setSelection,
    addProject,
    addTag,
    addFolder,
    addPerspective,
    patchPerspective,
    removePerspective,
    reorderProject,
    reorderTag,
    reorderFolder,
    syncStatus,
    error,
    exportDocument,
    importDocument,
  } = useGtd()
  const [projectName, setProjectName] = useState('')
  const [tagName, setTagName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [perspectiveEditorId, setPerspectiveEditorId] = useState<string | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const perspectives = useMemo(() => builtinPerspectives(), [])
  const projects = useMemo(
    () => rowStore.liveProjects().map(p => ({
      id: p.id,
      name: p.data.name,
      folderId: p.data.folderId,
      status: p.data.status,
      order: p.data.order,
    })),
    [rowStore],
  )
  const tags = useMemo(
    () => rowStore.liveTags().map(t => ({
      id: t.id,
      name: t.data.name,
      parentId: t.data.parentId,
      order: t.data.order,
    })),
    [rowStore],
  )
  const folders = useMemo(
    () => rowStore.liveFolders().map(f => ({
      id: f.id,
      name: f.data.name,
      parentId: f.data.parentId,
      order: f.data.order,
    })),
    [rowStore],
  )
  const folderTree = useMemo(() => buildFolderTree(rowStore.liveFolders()), [rowStore])
  const tagTree = useMemo(() => buildTagTree(rowStore.liveTags()), [rowStore])
  const rootProjects = useMemo(
    () => projects
      .filter(p => p.folderId == null && p.status !== EXPLICIT_STATUS.DELETED)
      .sort((a, b) => a.order - b.order),
    [projects],
  )
  const activeProjects = useMemo(
    () => projects
      .filter(p => p.status !== EXPLICIT_STATUS.DELETED)
      .sort((a, b) => a.order - b.order),
    [projects],
  )
  const customPerspectives = useMemo(
    () => rowStore.livePerspectives().map(p => ({ id: p.id, name: p.data.name })),
    [rowStore],
  )

  const syncLabel = syncStatus === 'syncing'
    ? '同步中…'
    : syncStatus === 'offline'
      ? '离线'
      : syncStatus === 'error'
        ? '同步错误'
        : null

  const editingPerspective = useMemo(() => {
    if (!perspectiveEditorId || perspectiveEditorId === 'new')
      return undefined
    const r = rowStore.livePerspectives().find(p => p.id === perspectiveEditorId)
    return r ? { id: r.id, ...r.data } : undefined
  }, [perspectiveEditorId, rowStore])

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id)
          return
        const [kind, id] = String(active.id).split(':')
        const [overKind, overId] = String(over.id).split(':')
        if (!id || !overId || kind !== overKind)
          return
        const source = kind === 'project'
          ? projects
          : kind === 'tag'
            ? tags
            : folders
        const entity = source.find(item => item.id === id)
        const overEntity = source.find(item => item.id === overId)
        if (!entity || !overEntity)
          return
        const parentOf = (item: typeof entity) => {
          if ('folderId' in item)
            return item.folderId
          return item.parentId
        }
        if (parentOf(entity) !== parentOf(overEntity))
          return
        const siblings = source
          .filter(item => parentOf(item) === parentOf(entity))
          .sort((a, b) => a.order - b.order)
        const moved = arrayMove(
          siblings,
          siblings.findIndex(item => item.id === id),
          siblings.findIndex(item => item.id === overId),
        )
        const index = moved.findIndex(item => item.id === id)
        const target = {
          beforeId: moved[index - 1]?.id ?? null,
          afterId: moved[index + 1]?.id ?? null,
        }
        if (kind === 'project')
          reorderProject(id, target)
        else if (kind === 'tag')
          reorderTag(id, target)
        else
          reorderFolder(id, target)
      }}
    >
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">GTD</span>
          <div className="flex items-center gap-2">
            {syncLabel && <span className="text-[10px] text-muted-foreground">{syncLabel}</span>}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="导出 JSON"
              onClick={() => {
                const json = exportDocument()
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `gtd-export-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="size-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="导入 JSON（仅新建，不覆盖）"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file)
              return
            void file.text().then((text) => {
              importDocument(text)
            })
            e.target.value = ''
          }}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="mb-3 space-y-0.5">
            {perspectives.map((p) => {
              const Icon = PERSPECTIVE_ICONS[p.id]
              return (
                <NavItem
                  key={p.id}
                  active={selection.kind === 'perspective' && selection.id === p.id}
                  icon={Icon}
                  label={p.name}
                  onClick={() => setSelection({ kind: 'perspective', id: p.id })}
                />
              )
            })}
          </div>

          <div className="mb-1 flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>自定义透视</span>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
              onClick={() => setPerspectiveEditorId('new')}
              title="新建自定义透视"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="mb-3 space-y-0.5">
            {customPerspectives.map(perspective => (
              <div key={perspective.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <NavItem
                    active={selection.kind === 'perspective' && selection.id === perspective.id}
                    icon={Sparkles}
                    label={perspective.name}
                    onClick={() => setSelection({ kind: 'perspective', id: perspective.id })}
                  />
                </div>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  onClick={() => setPerspectiveEditorId(perspective.id)}
                  title="编辑自定义透视"
                >
                  <Settings2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 group-hover:opacity-100"
                  onClick={() => removePerspective(perspective.id)}
                  title="删除自定义透视"
                >
                  ×
                </button>
              </div>
            ))}
            {customPerspectives.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">暂无自定义透视</p>
            )}
          </div>

          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            项目
          </div>
          <div className="mb-3 space-y-0.5">
            <FolderNodes
              nodes={folderTree.roots}
              depth={0}
              selection={selection}
              projects={activeProjects}
              onSelect={setSelection}
            />
            <SortableContext
              items={rootProjects.map(p => `project:${p.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {rootProjects.map(p => (
                <SortableNavItem
                  key={p.id}
                  sortableId={`project:${p.id}`}
                  active={selection.kind === 'project' && selection.id === p.id}
                  icon={Layers}
                  label={p.name}
                  onClick={() => setSelection({ kind: 'project', id: p.id })}
                />
              ))}
            </SortableContext>
            <div className="flex gap-1 px-1 pt-1">
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && projectName.trim()) {
                    addProject(projectName)
                    setProjectName('')
                  }
                }}
                placeholder="新项目"
                className="h-9 border-border bg-transparent text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => {
                  if (!projectName.trim())
                    return
                  addProject(projectName)
                  setProjectName('')
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex gap-1 px-1">
              <Input
                value={folderName}
                onChange={e => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && folderName.trim()) {
                    addFolder(folderName)
                    setFolderName('')
                  }
                }}
                placeholder="新文件夹"
                className="h-9 border-border bg-transparent text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => {
                  if (!folderName.trim())
                    return
                  addFolder(folderName)
                  setFolderName('')
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            标签
          </div>
          <div className="space-y-0.5">
            <TagNodes
              nodes={tagTree.roots}
              depth={0}
              selection={selection}
              onSelect={setSelection}
            />
            <div className="flex gap-1 px-1 pt-1">
              <Input
                value={tagName}
                onChange={e => setTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagName.trim()) {
                    addTag(tagName)
                    setTagName('')
                  }
                }}
                placeholder="新标签"
                className="h-9 border-border bg-transparent text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => {
                  if (!tagName.trim())
                    return
                  addTag(tagName)
                  setTagName('')
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-t border-rose-500/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}
      </aside>
      {perspectiveEditorId && (
        <GtdPerspectiveEditor
          store={rowStore}
          perspective={editingPerspective}
          error={error}
          onClose={() => setPerspectiveEditorId(null)}
          onSave={(input: PerspectiveInput) => {
            const saved = perspectiveEditorId === 'new'
              ? addPerspective(input)
              : patchPerspective(perspectiveEditorId, input)
            if (saved)
              setPerspectiveEditorId(null)
          }}
        />
      )}
    </DndContext>
  )
}
