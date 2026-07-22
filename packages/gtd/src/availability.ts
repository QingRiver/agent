import type { RowStore } from './rows'
import type { ComputedStatus } from './schema'
import type { EntityRowOf } from './sync-schema'
import type { TaskTree } from './tree'
import { buildTaskTree } from './tree'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from './types'

/**
 * 可用性计算。派生状态不落 JSON，实时计算。
 * 吃 RowStore（行级），不再吃 GtdDocument。
 */

interface ComputeContext {
  now: Date
  tree: TaskTree
  dueSoonIntervalMs: number
  projects: EntityRowOf<'project'>[]
  cache: Map<string, ComputedStatus>
  visiting: Set<string>
}

function projectRootTasks(tree: TaskTree, projectId: string): EntityRowOf<'task'>[] {
  return tree.roots
    .filter(n => n.task.data.projectId === projectId && n.task.data.parentId === null)
    .map(n => n.task)
    .sort((a, b) => a.data.order - b.data.order)
}

function computeStatusInner(task: EntityRowOf<'task'>, ctx: ComputeContext): ComputedStatus {
  const cached = ctx.cache.get(task.id)
  if (cached) {
    return cached
  }
  if (ctx.visiting.has(task.id)) {
    return COMPUTED_STATUS.BLOCKED
  }
  ctx.visiting.add(task.id)

  // 终态 → blocked
  if (
    task.data.status === EXPLICIT_STATUS.COMPLETED
    || task.data.status === EXPLICIT_STATUS.CANCELLED
    || task.data.status === EXPLICIT_STATUS.DELETED
  ) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  // deferDate 在未来 → blocked
  if (task.data.deferDate && new Date(task.data.deferDate).getTime() > ctx.now.getTime()) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  // 祖先 task 派生 blocked → blocked（递归上溯）
  let ancestor = ctx.tree.byId.get(task.id)?.parent ?? null
  while (ancestor) {
    const ancStatus = computeStatusInner(ancestor.task, ctx)
    if (ancStatus === COMPUTED_STATUS.BLOCKED) {
      ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.BLOCKED
    }
    ancestor = ancestor.parent
  }

  // 祖先 project on_hold → blocked
  if (task.data.projectId) {
    const proj = ctx.projects.find(p => p.id === task.data.projectId)
    if (proj && proj.data.status === EXPLICIT_STATUS.ON_HOLD) {
      ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.BLOCKED
    }
  }

  // 项目级 sequential：顶层 action 前序未完成 → blocked
  if (task.data.projectId && task.data.parentId === null) {
    const proj = ctx.projects.find(p => p.id === task.data.projectId)
    if (proj?.data.type === GROUP_TYPE.SEQUENTIAL) {
      const roots = projectRootTasks(ctx.tree, task.data.projectId)
      const idx = roots.findIndex(s => s.id === task.id)
      if (idx > 0 && roots.slice(0, idx).some(s => s.data.status === EXPLICIT_STATUS.ACTIVE)) {
        ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
        ctx.visiting.delete(task.id)
        return COMPUTED_STATUS.BLOCKED
      }
    }
  }

  // action group sequential：前序 sibling 未完成 → blocked
  let node = ctx.tree.byId.get(task.id)
  while (node?.parent) {
    const parent = node.parent
    if (parent.task.data.groupType === GROUP_TYPE.SEQUENTIAL) {
      const siblings = parent.children.map(c => c.task)
      const idx = siblings.findIndex(s => s.id === node!.task.id)
      if (idx > 0 && siblings.slice(0, idx).some(s => s.data.status === EXPLICIT_STATUS.ACTIVE)) {
        ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
        ctx.visiting.delete(task.id)
        return COMPUTED_STATUS.BLOCKED
      }
    }
    node = parent
  }

  // dueDate：过期/临近
  if (task.data.dueDate) {
    const dueMs = new Date(task.data.dueDate).getTime()
    if (dueMs < ctx.now.getTime()) {
      ctx.cache.set(task.id, COMPUTED_STATUS.OVERDUE)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.OVERDUE
    }
    if (dueMs <= ctx.now.getTime() + ctx.dueSoonIntervalMs) {
      ctx.cache.set(task.id, COMPUTED_STATUS.DUE_SOON)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.DUE_SOON
    }
  }

  ctx.cache.set(task.id, COMPUTED_STATUS.AVAILABLE)
  ctx.visiting.delete(task.id)
  return COMPUTED_STATUS.AVAILABLE
}

/**
 * 计算单个 Task 的 ComputedStatus。
 * projects 可选：传入后检查祖先 project on_hold / sequential。
 */
export function computeStatus(
  task: EntityRowOf<'task'>,
  now: Date,
  tree: TaskTree,
  dueSoonIntervalMs: number,
  projects: EntityRowOf<'project'>[] = [],
  cache?: Map<string, ComputedStatus>,
): ComputedStatus {
  return computeStatusInner(task, {
    now,
    tree,
    dueSoonIntervalMs,
    projects,
    cache: cache ?? new Map(),
    visiting: new Set(),
  })
}

/** 计算 RowStore 内全部 Task 的 ComputedStatus，返回 taskId→状态映射 */
export function computeAll(
  rowStore: RowStore,
  now: Date,
  dueSoonIntervalMs: number,
): Record<string, ComputedStatus> {
  const tasks = rowStore.liveTasks()
  const tree = buildTaskTree(tasks)
  const cache = new Map<string, ComputedStatus>()
  const result: Record<string, ComputedStatus> = {}
  for (const t of tasks) {
    result[t.id] = computeStatus(t, now, tree, dueSoonIntervalMs, rowStore.liveProjects(), cache)
  }
  return result
}
