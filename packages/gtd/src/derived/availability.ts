/**
 * 可用性计算。派生状态不持久化，实时计算。
 */
import type { RowStore } from '../data/rows'
import type { ComputedStatus } from '../data/schema'
import type { EntityRowOf } from '../data/sync-schema'
import type { TaskTree } from '../structure/tree'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import { effectiveDefer, effectiveDue } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'
import { isWallClockUnlocked } from '../time/clock'

/** 可用性计算上下文 */
interface ComputeContext {
  /** 当前时间 */
  now: Date
  /** 任务树 */
  tree: TaskTree
  /** 即将到期的间隔时间 */
  dueSoonIntervalMs: number
  /** 缓存 */
  cache: Map<string, ComputedStatus>
  /** 正在访问的任务 */
  visiting: Set<string>
}

function computeStatusInner(task: EntityRowOf<'task'>, ctx: ComputeContext): ComputedStatus {
  /* 缓命中直接返回 */
  const cached = ctx.cache.get(task.id)
  if (cached) {
    return cached
  }

  /** 环路检测：避免无限递归 */
  if (ctx.visiting.has(task.id)) {
    return COMPUTED_STATUS.BLOCKED
  }
  ctx.visiting.add(task.id)

  /** 终态 → 阻塞 */
  if (
    task.data.status === EXPLICIT_STATUS.COMPLETED
    || task.data.status === EXPLICIT_STATUS.HOLD
    || task.data.status === EXPLICIT_STATUS.DELETED
  ) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  /** 墙钟未解锁（effectiveDefer > now）→ 阻塞 */
  if (!isWallClockUnlocked(effectiveDefer(task, ctx.tree), ctx.now)) {
    ctx.cache.set(task.id, COMPUTED_STATUS.BLOCKED)
    ctx.visiting.delete(task.id)
    return COMPUTED_STATUS.BLOCKED
  }

  /**
   * 祖先派生阻塞
   * 递归上溯 容器不可用 里面的动作也不可用
   */
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

  /**
   * 兄弟派生阻塞
   * 串行判别 前序兄弟不可用 后置动作也不可用
   */
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

  /** 截止日计算 */
  const effDue = effectiveDue(task, ctx.tree)
  if (effDue) {
    const dueMs = new Date(effDue).getTime()

    /** 过期 → 已逾期 */
    if (dueMs < ctx.now.getTime()) {
      ctx.cache.set(task.id, COMPUTED_STATUS.OVERDUE)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.OVERDUE
    }

    /** 临近 → 即将到期 */
    if (dueMs <= ctx.now.getTime() + ctx.dueSoonIntervalMs) {
      ctx.cache.set(task.id, COMPUTED_STATUS.DUE_SOON)
      ctx.visiting.delete(task.id)
      return COMPUTED_STATUS.DUE_SOON
    }
  }

  /** 正常 → 可执行 */
  ctx.cache.set(task.id, COMPUTED_STATUS.AVAILABLE)
  ctx.visiting.delete(task.id)
  return COMPUTED_STATUS.AVAILABLE
}

/**
 * 计算单个 Task 的 ComputedStatus。
 */
export function computeStatus(
  task: EntityRowOf<'task'>,
  now: Date,
  tree: TaskTree,
  dueSoonIntervalMs: number,
  cache?: Map<string, ComputedStatus>,
): ComputedStatus {
  return computeStatusInner(task, {
    now,
    tree,
    dueSoonIntervalMs,
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
    result[t.id] = computeStatus(t, now, tree, dueSoonIntervalMs, cache)
  }
  return result
}
