import type { ComputedStatus } from '@agent/gtd'
import { COMPUTED_STATUS, EXPLICIT_STATUS } from '@agent/gtd'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGtd } from '@hooks/useGtd'
import { cn } from '@lib/utils'
import { ChevronDown, ChevronRight, Flag, GripVertical, Repeat2 } from 'lucide-react'

function statusDotClass(computed: ComputedStatus | null, explicit: string): string {
  if (explicit === EXPLICIT_STATUS.COMPLETED)
    return 'bg-muted-foreground'
  if (explicit === EXPLICIT_STATUS.CANCELLED || explicit === EXPLICIT_STATUS.DELETED)
    return 'bg-muted-foreground/80'
  switch (computed) {
    case COMPUTED_STATUS.AVAILABLE:
      return 'bg-emerald-400'
    case COMPUTED_STATUS.DUE_SOON:
      return 'bg-amber-400'
    case COMPUTED_STATUS.OVERDUE:
      return 'bg-rose-400'
    case COMPUTED_STATUS.BLOCKED:
      return 'bg-muted-foreground'
    default:
      return 'bg-muted-foreground'
  }
}

function formatDue(due: string | null): string | null {
  if (!due)
    return null
  try {
    return new Date(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  catch {
    return null
  }
}

export function GtdTaskRow({
  taskId,
  depth,
  computed,
  sortable = false,
  hasChildren = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  taskId: string
  depth: number
  computed: ComputedStatus
  sortable?: boolean
  hasChildren?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const {
    rowStore,
    selectedTaskId,
    selectTask,
    completeTask,
    reopenTask,
    toggleFlag,
  } = useGtd()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskId, disabled: !sortable })

  const task = rowStore.findLive('task', taskId)
  if (!task || task.data.status === EXPLICIT_STATUS.DELETED)
    return null

  const done = task.data.status === EXPLICIT_STATUS.COMPLETED
  const selected = selectedTaskId === taskId
  const dueLabel = formatDue(task.data.dueDate)

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={() => selectTask(taskId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ')
          selectTask(taskId)
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/80',
        selected && 'bg-accent',
        isDragging && 'z-10 opacity-50',
      )}
      style={{
        paddingLeft: `${8 + depth * 16}px`,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {sortable && (
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          title="拖动排序"
          aria-label="拖动排序"
          onClick={e => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {hasChildren
        ? (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={collapsed ? '展开子任务' : '折叠子任务'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapsed?.()
              }}
            >
              {collapsed
                ? <ChevronRight className="size-4" />
                : <ChevronDown className="size-4" />}
            </button>
          )
        : <span className="w-2 shrink-0" />}
      <Checkbox
        checked={done}
        onCheckedChange={(state) => {
          if (state === true)
            completeTask(taskId)
          else
            reopenTask(taskId)
        }}
        onClick={e => e.stopPropagation()}
        className="size-4"
        aria-label={done ? '标记未完成' : '标记完成'}
      />
      <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(computed, task.data.status))} />
      <span className={cn('min-w-0 flex-1 truncate', done && 'text-muted-foreground line-through')}>
        {task.data.name}
      </span>
      {task.data.repeatRuleId && (
        <Repeat2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="重复任务" />
      )}
      {dueLabel && (
        <span className={cn(
          'shrink-0 text-xs',
          computed === COMPUTED_STATUS.OVERDUE ? 'text-rose-400' : 'text-muted-foreground',
        )}
        >
          {dueLabel}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 w-8 shrink-0 p-0',
          task.data.flagged ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
        )}
        onClick={(e) => {
          e.stopPropagation()
          toggleFlag(taskId)
        }}
      >
        <Flag className="size-3.5" fill={task.data.flagged ? 'currentColor' : 'none'} />
      </Button>
    </div>
  )
}
