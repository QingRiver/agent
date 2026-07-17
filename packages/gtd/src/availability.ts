import type { ComputedStatus, GtdDocument, Project, Task } from './schema'
import type { TaskTree } from './tree'
import { buildTaskTree } from './tree'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from './types'

/**
 * 可用性计算（SPEC §5.2）。派生状态不落 JSON，实时计算。
 */

interface ComputeContext {
  now: Date
  tree: TaskTree
  dueSoonIntervalMs: number
  projects: Project[]
  cache: Map<string, ComputedStatus>
  visiting: Set<string>
}

function projectRootTasks(tree: TaskTree, projectId: string): Task[] {
  return tree.roots
    .filter(n => n.task.projectId === projectId && n.task.parentId === null)
    .map(n => n.task)
    .sort((a, b) => a.order - b.order)
}

function computeStatusInner(task: Task, ctx: ComputeContext): ComputedStatus {
  const cached = ctx.cache.get(task.id)
  if (cached)
    return cached
  if (ctx.visiting.has(task.id))
    return COMPUTED_STATUS.BLOCKED
  ctx.visiting.add(task.id)

  // 终态 → blocked
  if (
    task.status === EXPLICIT_STATUS.COMPLETED
    || task.status === EXPLICIT_STATUS.CANCELLED
    || task.status === EXPLICIT_STATUS.DELETED
  ) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  // deferDate 在未来 → blocked
  if (task.deferDate && new Date(task.deferDate).getTime() > ctx.now.getTime()) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  // 祖先 task 派生 blocked → blocked（SPEC §5.2 递归上溯）
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
  if (task.projectId) {
    const proj = ctx.projects.find(p => p.id === task.projectId)
    if (proj && proj.status === EXPLICIT_STATUS.ON_HOLD) {
      ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.BLOCKED
    }
  }

  // 项目级 sequential：顶层 action 前序未完成 → blocked
  if (task.projectId && task.parentId === null) {
    const proj = ctx.projects.find(p => p.id === task.projectId)
    if (proj?.type === GROUP_TYPE.SEQUENTIAL) {
      const roots = projectRootTasks(ctx.tree, task.projectId)
      const idx = roots.findIndex(s => s.id === task.id)
      if (idx > 0 && roots.slice(0, idx).some(s => s.status === EXPLICIT_STATUS.ACTIVE)) {
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
    if (parent.task.groupType === GROUP_TYPE.SEQUENTIAL) {
      const siblings = parent.children.map(c => c.task)
      const idx = siblings.findIndex(s => s.id === node!.task.id)
      if (idx > 0 && siblings.slice(0, idx).some(s => s.status === EXPLICIT_STATUS.ACTIVE)) {
        ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
        ctx.visiting.delete(task.id)
        return COMPUTED_STATUS.BLOCKED
      }
    }
    node = parent
  }

  // dueDate：过期/临近
  if (task.dueDate) {
    const dueMs = new Date(task.dueDate).getTime()
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
 * projects 可选：传入后检查祖先 project on_hold / sequential（单测默认不传则跳过 project 级检查）。
 */
export function computeStatus(
  task: Task,
  now: Date,
  tree: TaskTree,
  dueSoonIntervalMs: number,
  projects: Project[] = [],
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

/** 计算 doc 内全部 Task 的 ComputedStatus，返回 taskId→状态映射 */
export function computeAll(
  doc: GtdDocument,
  now: Date,
  dueSoonIntervalMs: number,
): Record<string, ComputedStatus> {
  const tree = buildTaskTree(doc.tasks)
  const cache = new Map<string, ComputedStatus>()
  const result: Record<string, ComputedStatus> = {}
  for (const t of doc.tasks)
    result[t.id] = computeStatus(t, now, tree, dueSoonIntervalMs, doc.projects, cache)
  return result
}
