import type { TaskTree } from '../structure/tree'
import type { EntityRow, EntityRowOf, GtdEntity } from './row-schema'
import type { ComputedStatus } from './schema'
import type { ExplicitStatusValue } from './types'
import { computeAvailability } from '../derived/availability'
import { effectiveStatus } from '../inheritance/effective'
import {
  attachmentIdsOf,
  findLive,
  liveAll,
  liveAttachments,
  liveOf,
  livePerspectives,
  liveTasks,
  liveTaskTags,
  RowStore,
  tagIdsOf,
  taskTree,
} from './rows'

/**
 * L2 读口门面：RowStore 查询 + 惰性缓存 taskTree + 常用派生便捷方法。
 * 不搬 effective/availability 实现；同实例内 tree 只建一次，rows 引用变了或 invalidate 后重建。
 */
export class GtdReader {
  private readonly rows: EntityRow[]
  private readonly store: RowStore
  private cachedTree: TaskTree | null = null

  constructor(rows: EntityRow[] = []) {
    this.rows = rows
    this.store = new RowStore(rows)
  }

  /** 底层行数组（与构造时同一引用） */
  allRows(): readonly EntityRow[] {
    return this.rows
  }

  /** 如需兼容只吃 RowStore 的旧 API */
  asRowStore(): RowStore {
    return this.store
  }

  invalidate(): void {
    this.cachedTree = null
  }

  liveTasks(): EntityRowOf<'task'>[] {
    return liveTasks(this.rows)
  }

  livePerspectives(): EntityRowOf<'perspective'>[] {
    return livePerspectives(this.rows)
  }

  liveAttachments(): EntityRowOf<'attachment'>[] {
    return liveAttachments(this.rows)
  }

  liveTaskTags(): EntityRowOf<'task_tag'>[] {
    return liveTaskTags(this.rows)
  }

  liveAll(): EntityRow[] {
    return liveAll(this.rows)
  }

  liveOf<E extends GtdEntity>(entity: E): EntityRowOf<E>[] {
    return liveOf(this.rows, entity)
  }

  findLive<E extends GtdEntity>(entity: E, id: string): EntityRowOf<E> | undefined {
    return findLive(this.rows, entity, id)
  }

  tagIdsOf(taskId: string): string[] {
    return tagIdsOf(this.rows, taskId)
  }

  attachmentIdsOf(taskId: string): string[] {
    return attachmentIdsOf(this.rows, taskId)
  }

  /** live tasks 树（惰性缓存） */
  taskTree(): TaskTree {
    if (!this.cachedTree)
      this.cachedTree = taskTree(this.rows)
    return this.cachedTree
  }

  effectiveStatusOf(taskId: string): ExplicitStatusValue | undefined {
    const task = this.findLive('task', taskId)
    if (!task)
      return undefined
    return effectiveStatus(task, this.taskTree())
  }

  availabilityOf(
    taskId: string,
    now: Date,
    dueSoonIntervalMs: number,
  ): ComputedStatus | undefined {
    const task = this.findLive('task', taskId)
    if (!task)
      return undefined
    return computeAvailability(task, now, this.taskTree(), dueSoonIntervalMs)
  }
}
