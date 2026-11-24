import type { EntityRow, EntityRowOf, GtdEntity } from '../data/row-schema'
import type { TaskRow } from '../data/rows'
import type { ExplicitStatusValue } from '../data/types'
import type { TaskTree } from './tree'
import { liveTasks } from '../data/rows'
import { EXPLICIT_STATUS } from '../data/types'
import { effectiveStatus as effectiveStatusOfTask } from './effective'
import { ancestors, buildTaskTree } from './tree'

/**
 * 任务行的唯一读写入口。持有调用方传入的行数组，写操作原地修改并推进 syncId。
 */
export class GtdModel {
  readonly rows: EntityRow[]
  private treeCache: TaskTree | null = null
  private readonly alloc: () => number

  constructor(rows: EntityRow[] = [], nextSyncId?: () => number) {
    this.rows = rows
    let counter = rows.reduce((max, row) => Math.max(max, row.syncId), 0)
    this.alloc = nextSyncId ?? (() => ++counter)
  }

  nextSyncId(): number {
    return this.alloc()
  }

  touch(row: EntityRow): void {
    row.syncId = this.alloc()
  }

  invalidate(): void {
    this.treeCache = null
  }

  allRows(): readonly EntityRow[] {
    return this.rows
  }

  liveOf<E extends GtdEntity>(entity: E): EntityRowOf<E>[] {
    return this.rows.filter((row): row is EntityRowOf<E> => row.entity === entity && !row.deleted)
  }

  liveTasks(): TaskRow[] {
    return liveTasks(this.rows)
  }

  livePerspectives(): EntityRowOf<'perspective'>[] {
    return this.liveOf('perspective')
  }

  liveAttachments(): EntityRowOf<'attachment'>[] {
    return this.liveOf('attachment')
  }

  liveTaskTags(): EntityRowOf<'task_tag'>[] {
    return this.liveOf('task_tag')
  }

  liveAll(): EntityRow[] {
    return this.rows.filter(row => !row.deleted)
  }

  findLive<E extends GtdEntity>(entity: E, id: string): EntityRowOf<E> | undefined {
    return this.rows.find((row): row is EntityRowOf<E> => row.entity === entity && row.id === id && !row.deleted)
  }

  findTask(id: string): TaskRow | undefined {
    return this.findLive('task', id)
  }

  tagIdsOf(taskId: string): string[] {
    return this.liveTaskTags().filter(row => row.data.taskId === taskId).map(row => row.data.tagId)
  }

  attachmentIdsOf(taskId: string): string[] {
    return this.liveAttachments().filter(row => row.data.taskId === taskId).map(row => row.id)
  }

  /** 活任务树。同一批行上缓存，写入后 invalidate。 */
  tree(): TaskTree {
    return this.treeCache ??= buildTaskTree(this.liveTasks())
  }

  ancestors(taskId: string): TaskRow[] {
    return ancestors(this.tree(), taskId)
  }

  effectiveStatus(taskId: string): ExplicitStatusValue {
    const task = this.findTask(taskId)
    if (!task)
      return EXPLICIT_STATUS.DELETED
    return effectiveStatusOfTask(task, this.tree())
  }

  setStatus(task: TaskRow, status: ExplicitStatusValue, ts: string): void {
    task.data.status = status
    task.data.statusChangedAt = status === EXPLICIT_STATUS.ACTIVE ? null : ts
    task.data.updatedAt = ts
    this.touch(task)
    this.invalidate()
  }
}
