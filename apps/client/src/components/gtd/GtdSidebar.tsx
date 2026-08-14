import type { Perspective, PerspectiveInput } from '@agent/gtd'
import type { DirTreeNode } from '@agent/project'
import type { GtdSelection } from '@stores/gtd-store'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { BUILTIN_PERSPECTIVE_ID, BUILTIN_PERSPECTIVE_NAME, FILTER_FIELD } from '@agent/gtd'
import { GtdPerspectiveEditor } from '@components/gtd/GtdPerspectiveEditor'
import { TagManager } from '@components/tags/TagManager'
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
import { downloadFile } from '@lib/downloadFile'
import { cn } from '@lib/utils'
import { DirStore } from '@stores/dir-store'
import { TagsStore } from '@stores/tags-store'
import { useAtomValue } from 'jotai'
import {
  CalendarDays,
  Download,
  GripVertical,
  Layers,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef, useState } from 'react'
import {
  selectPerspective,
  selectProjectFocus,
  selectTagFocus,
} from '../../gtd/view-options'

function NavItem({
  active,
  icon: Icon,
  label,
  onClick,
  indent = 0,
  dragHandle,
}: {
  active: boolean
  icon?: LucideIcon
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

/**
 * 统一 dirs 树中的 **project 根** 列表（GTD 侧栏「项目」区）。
 * 只展示 kind=project，不展开其下 dir 子树（KB vdir 文件夹树不进 GTD 导航）。
 */
function ProjectList({
  nodes,
  selection,
  onSelect,
}: {
  nodes: DirTreeNode[]
  selection: GtdSelection
  onSelect: (sel: GtdSelection) => void
}) {
  const projects = nodes.filter(n => n.dir.kind === 'project')
  // DnD id 仍用 project:<id>，与 selection 解耦
  const items = projects.map(n => `project:${n.dir.id}`)
  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {projects.map((n) => {
        const sid = `project:${n.dir.id}`
        const active = selection.focus?.field === FILTER_FIELD.PROJECT
          && selection.focus.id === n.dir.id
        return (
          <SortableNavItem
            key={n.dir.id}
            sortableId={sid}
            active={active}
            icon={Layers}
            label={n.dir.name}
            indent={0}
            onClick={() => onSelect(selectProjectFocus(n.dir.id))}
          />
        )
      })}
    </SortableContext>
  )
}

export function GtdSidebar() {
  const {
    rowStore,
    selection,
    setSelection,
    addPerspective,
    patchPerspective,
    removePerspective,
    syncStatus,
    error,
    exportDocument,
    importDocument,
  } = useGtd()
  const [projectName, setProjectName] = useState('')
  const [tagName, setTagName] = useState('')
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [perspectiveEditorId, setPerspectiveEditorId] = useState<string | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dirs = useAtomValue(DirStore.dirsAtom)
  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const dirTree = useAtomValue(DirStore.dirTreeAtom)
  const tags = useAtomValue(TagsStore.tagsAtom)
  const flatTags = [...tags].sort((a, b) => a.name.localeCompare(b.name))
  const userPerspectives = rowStore.livePerspectives().map(p => ({ id: p.id, name: p.data.name }))

  const syncLabel = syncStatus === 'syncing'
    ? '同步中…'
    : syncStatus === 'offline'
      ? '离线'
      : syncStatus === 'error'
        ? '同步错误'
        : null

  function resolveEditingPerspective() {
    if (!perspectiveEditorId || perspectiveEditorId === 'new')
      return undefined
    const r = rowStore.livePerspectives().find(p => p.id === perspectiveEditorId)
    if (!r)
      return undefined
    return {
      id: r.id,
      ...r.data,
      filter: r.data.filter as Perspective['filter'],
    }
  }
  const editingPerspective = resolveEditingPerspective()

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
        const a = dirsById.get(id)
        const b = dirsById.get(overId)
        if (!a || !b || a.parentId !== b.parentId)
          return
        const siblings = dirs
          .filter(d => d.parentId === a.parentId && d.kind === 'project')
          .map(d => ({ id: d.id, order: d.sortOrder }))
          .sort((x, y) => x.order - y.order)
        const moved = arrayMove(
          siblings,
          siblings.findIndex(s => s.id === id),
          siblings.findIndex(s => s.id === overId),
        )
        const index = moved.findIndex(s => s.id === id)
        const target = {
          beforeId: moved[index - 1]?.id ?? null,
          afterId: moved[index + 1]?.id ?? null,
        }
        if (kind === 'project')
          void DirStore.reorderSibling(id, target, null)
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
                downloadFile(
                  json,
                  `gtd-export-${new Date().toISOString().slice(0, 10)}.json`,
                  'application/json',
                )
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
          <div className="mb-1 flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>透视</span>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
              onClick={() => setPerspectiveEditorId('new')}
              title="新建透视"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="mb-3 space-y-0.5">
            <NavItem
              active={selection.focus == null && selection.perspectiveId === BUILTIN_PERSPECTIVE_ID.FORECAST}
              icon={CalendarDays}
              label={BUILTIN_PERSPECTIVE_NAME[BUILTIN_PERSPECTIVE_ID.FORECAST]}
              onClick={() => setSelection(selectPerspective(BUILTIN_PERSPECTIVE_ID.FORECAST))}
            />
            <NavItem
              active={selection.focus == null && selection.perspectiveId === BUILTIN_PERSPECTIVE_ID.TRASH}
              icon={Trash2}
              label={BUILTIN_PERSPECTIVE_NAME[BUILTIN_PERSPECTIVE_ID.TRASH]}
              onClick={() => setSelection(selectPerspective(BUILTIN_PERSPECTIVE_ID.TRASH))}
            />
            {userPerspectives.map(perspective => (
              <div key={perspective.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <NavItem
                    active={selection.focus == null && selection.perspectiveId === perspective.id}
                    icon={Sparkles}
                    label={perspective.name}
                    onClick={() => setSelection(selectPerspective(perspective.id))}
                  />
                </div>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  onClick={() => setPerspectiveEditorId(perspective.id)}
                  title="编辑透视"
                >
                  <Settings2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 group-hover:opacity-100"
                  onClick={() => removePerspective(perspective.id)}
                  title="删除透视"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            项目
          </div>
          <div className="mb-3 space-y-0.5">
            <ProjectList
              nodes={dirTree.roots}
              selection={selection}
              onSelect={setSelection}
            />
            <div className="flex gap-1 px-1 pt-1">
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && projectName.trim()) {
                    void DirStore.createProject(projectName.trim())
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
                  void DirStore.createProject(projectName.trim())
                  setProjectName('')
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mb-1 flex items-center gap-1 px-2">
            <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              标签
            </span>
            <button
              type="button"
              title="管理标签"
              onClick={() => setTagManagerOpen(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {flatTags.map(tag => (
              <NavItem
                key={tag.id}
                active={selection.focus?.field === FILTER_FIELD.TAG && selection.focus.id === tag.id}
                icon={Tag}
                label={tag.name}
                onClick={() => setSelection(selectTagFocus(tag.id))}
              />
            ))}
            <div className="flex gap-1 px-1 pt-1">
              <Input
                value={tagName}
                onChange={e => setTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagName.trim()) {
                    void TagsStore.create(tagName.trim()).then(() => setTagName(''))
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
                  void TagsStore.create(tagName.trim()).then(() => setTagName(''))
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
      <TagManager open={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
      {perspectiveEditorId && (
        <GtdPerspectiveEditor
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
