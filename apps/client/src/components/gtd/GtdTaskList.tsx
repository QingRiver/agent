import type { EntityRowOf, RenderGroup, RenderItem } from '@agent/gtd'
import {
  BUILTIN_PERSPECTIVE_ID,
  DEFAULT_AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  isInboxFilter,
  renderPerspective,
  SORT_FIELD,
  stripToForecastOptions,
} from '@agent/gtd'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useGtd } from '@hooks/useGtd'
import { cn } from '@lib/utils'
import { DirStore } from '@stores/dir-store'
import { GtdStore, resolvePerspective, resolvePerspectiveAvailability } from '@stores/gtd-store'
import { useAtomValue } from 'jotai'
import { Settings2 } from 'lucide-react'
import { useState } from 'react'
import { patchForAvailability } from '../../gtd/view-options'
import { GtdAvailabilityFilter } from './GtdAvailabilityFilter'
import { GtdForecastStrip } from './GtdForecastStrip'
import { GtdTaskRow } from './GtdTaskRow'

function isGroup(node: RenderGroup | RenderItem): node is RenderGroup {
  return 'children' in node
}

function taskShape(r: EntityRowOf<'task'>) {
  return { id: r.id, ...r.data }
}

function RenderNodes({
  nodes,
  sortable,
  collapsed,
  hidden,
  parents,
  stickyHeaders,
  onToggleCollapsed,
}: {
  nodes: Array<RenderGroup | RenderItem>
  sortable: boolean
  collapsed: Set<string>
  hidden: Set<string>
  parents: Set<string>
  stickyHeaders: boolean
  onToggleCollapsed: (taskId: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (isGroup(node)) {
          return (
            <div key={node.key || 'root'} className="mb-3">
              {node.label
                ? (
                    <div
                      className={cn(
                        'mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground',
                        stickyHeaders && 'sticky top-0 z-10 bg-background/95 py-1 backdrop-blur-sm',
                      )}
                    >
                      {node.label}
                    </div>
                  )
                : null}
              <RenderNodes
                nodes={node.children}
                sortable={sortable}
                collapsed={collapsed}
                hidden={hidden}
                parents={parents}
                stickyHeaders={stickyHeaders}
                onToggleCollapsed={onToggleCollapsed}
              />
            </div>
          )
        }
        if (hidden.has(node.taskId))
          return null
        return (
          <GtdTaskRow
            key={node.taskId}
            taskId={node.taskId}
            depth={node.depth}
            computed={node.computed}
            sortable={sortable}
            hasChildren={parents.has(node.taskId)}
            collapsed={collapsed.has(node.taskId)}
            onToggleCollapsed={() => onToggleCollapsed(node.taskId)}
          />
        )
      })}
    </>
  )
}

export function GtdTaskList() {
  const {
    rowStore,
    selection,
    forecastStrip,
    forecastSignals,
    viewOptionsMap,
    isLoading,
    addInboxTask,
    addProjectTask,
    reorderTask,
    toggleForecastStripSegment,
    patchForecastSignals,
    patchViewOptions,
  } = useGtd()
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const perspective = resolvePerspective(rowStore, selection)
  const availabilityFilter = resolvePerspectiveAvailability(selection, viewOptionsMap)
  const focus = selection.focus
  const isForecast = selection.perspectiveId === BUILTIN_PERSPECTIVE_ID.FORECAST && focus == null
  // project 退出 GTD sync，名称来自 DirStore dirsById 投影
  const selectedDir = focus?.field === FILTER_FIELD.PROJECT
    ? dirsById.get(focus.id) ?? null
    : null

  function resolveTitle() {
    if (focus?.field === FILTER_FIELD.PROJECT)
      return selectedDir?.name ?? '项目'
    if (focus?.field === FILTER_FIELD.TAG)
      return rowStore.findLive('tag', focus.id)?.data.name ?? '标签'
    return perspective.name
  }
  const title = resolveTitle()
  const liveTasks = rowStore.liveTasks()

  // perspective 渲染需要墙钟「现在」与用户时区日界
  // eslint-disable-next-line react/purity -- wall-clock now for due/soon grouping
  const now = new Date()
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const forecastOptions = isForecast
    ? stripToForecastOptions(forecastStrip, forecastSignals, now, timeZone)
    : undefined
  const tree = renderPerspective(rowStore, perspective, now, GtdStore.dueSoonMs, timeZone, {
    availabilityFilter,
    forecastOptions,
  })

  function collectVisibleTaskIds() {
    const ids: string[] = []
    const visit = (nodes: Array<RenderGroup | RenderItem>) => {
      for (const node of nodes) {
        if (isGroup(node))
          visit(node.children)
        else if (!ids.includes(node.taskId))
          ids.push(node.taskId)
      }
    }
    visit(tree)
    return ids
  }
  const visibleTaskIds = collectVisibleTaskIds()
  const parentTaskIds = new Set(liveTasks.flatMap(task => task.data.parentId ? [task.data.parentId] : []))

  function collectHiddenTaskIds() {
    const hidden = new Set<string>()
    const byId = new Map(liveTasks.map(t => [t.id, t]))
    for (const task of liveTasks) {
      let parentId = task.data.parentId
      while (parentId) {
        if (collapsed.has(parentId)) {
          hidden.add(task.id)
          break
        }
        parentId = byId.get(parentId)?.data.parentId ?? null
      }
    }
    return hidden
  }
  const hiddenTaskIds = collectHiddenTaskIds()
  const activeCount = liveTasks.filter(t => t.data.status === EXPLICIT_STATUS.ACTIVE).length

  const inboxLike = focus == null && isInboxFilter(perspective.filter)
  const canQuickAdd = inboxLike || focus?.field === FILTER_FIELD.PROJECT
  const canManualReorder
    = perspective.sortBy[0]?.field === SORT_FIELD.ORDER
      && (focus?.field === FILTER_FIELD.PROJECT || inboxLike)

  const onAdd = () => {
    const name = draft.trim()
    if (!name)
      return
    if (focus?.field === FILTER_FIELD.PROJECT)
      addProjectTask(focus.id, name)
    else
      addInboxTask(name)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 shrink-0">
          <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {isLoading ? '加载中…' : `${activeCount} 个活跃任务`}
          </p>
        </div>
        {isForecast && (
          <GtdForecastStrip
            className="min-w-0 flex-1"
            value={forecastStrip}
            onToggle={key => toggleForecastStripSegment(key)}
          />
        )}
        {!isForecast && <div className="min-w-0 flex-1" />}
        <GtdAvailabilityFilter
          className="shrink-0"
          value={availabilityFilter ?? DEFAULT_AVAILABILITY_FILTER}
          onChange={v => patchViewOptions(patchForAvailability(v))}
        />
        {isForecast && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="size-8 shrink-0 p-0" title="视图选项">
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>包含信号</DropdownMenuLabel>
              {(
                [
                  ['includeOverdue', '逾期'],
                  ['includeDue', '截止'],
                  ['includeDeferred', '推迟'],
                  ['includePlanned', '计划'],
                  ['includeFlagged', '旗标'],
                ] as const
              ).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={forecastSignals[key]}
                  onCheckedChange={v => patchForecastSignals({ [key]: v === true })}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {canQuickAdd && (
        <div className="flex shrink-0 gap-2 border-b border-border px-4 py-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onAdd()
            }}
            placeholder={focus?.field === FILTER_FIELD.PROJECT ? '添加任务…' : '捕捉到收件箱…'}
            className="border-border bg-muted"
          />
          <Button type="button" className="h-9" onClick={onAdd} disabled={!draft.trim()}>
            添加
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id)
            return
          const task = rowStore.findLive('task', String(active.id))
          const overTask = rowStore.findLive('task', String(over.id))
          if (
            !task
            || !overTask
            || task.data.mountDirId !== overTask.data.mountDirId
            || task.data.parentId !== overTask.data.parentId
          ) {
            return
          }
          const siblings = liveTasks
            .filter(t =>
              t.data.mountDirId === task.data.mountDirId && t.data.parentId === task.data.parentId,
            )
            .map(taskShape)
            .sort((a, b) => a.order - b.order)
          const oldIndex = siblings.findIndex(t => t.id === task.id)
          const newIndex = siblings.findIndex(t => t.id === overTask.id)
          const moved = arrayMove(siblings, oldIndex, newIndex)
          const index = moved.findIndex(t => t.id === task.id)
          reorderTask(task.id, {
            beforeId: moved[index - 1]?.id ?? null,
            afterId: moved[index + 1]?.id ?? null,
          })
        }}
      >
        <SortableContext
          items={visibleTaskIds}
          strategy={verticalListSortingStrategy}
          disabled={!canManualReorder}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {tree.length === 0
              ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">暂无任务</p>
                )
              : (
                  <RenderNodes
                    nodes={tree}
                    sortable={canManualReorder}
                    collapsed={collapsed}
                    hidden={hiddenTaskIds}
                    parents={parentTaskIds}
                    stickyHeaders={isForecast}
                    onToggleCollapsed={(taskId) => {
                      setCollapsed((current) => {
                        const next = new Set(current)
                        if (next.has(taskId))
                          next.delete(taskId)
                        else
                          next.add(taskId)
                        return next
                      })
                    }}
                  />
                )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
