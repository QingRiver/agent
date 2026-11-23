import type { TaskTree } from '../structure/tree'
import type { EntityRow, EntityRowOf, GtdEntity } from './row-schema'
import { buildTaskTree } from '../structure/tree'

/**
 * Rows 查询面：EntityRow[] 的唯一读入口（写核 state-machine 与 derived/view 共用）。
 *
 * - 数组级纯函数供 command/apply 原地 mutation 使用
 * - {@link RowStore} 为同一套 API 的对象封装（读路径 / UI）
 * - {@link taskTree} / {@link RowStore.taskTree} 是 live tasks 的计算属性；
 *   `buildTaskTree` 仍是 structure 原语（子集单测可直接调）
 *
 * 目录投影（projectOf / dirNameOf / tagNameOf）不在此；见 view/catalog。
 */

export function liveOf<E extends GtdEntity>(
  rows: readonly EntityRow[],
  entity: E,
): EntityRowOf<E>[] {
  return rows.filter(
    (r): r is EntityRowOf<E> => r.entity === entity && !r.deleted,
  )
}

export function liveTasks(rows: readonly EntityRow[]): EntityRowOf<'task'>[] {
  return liveOf(rows, 'task')
}

export function livePerspectives(rows: readonly EntityRow[]): EntityRowOf<'perspective'>[] {
  return liveOf(rows, 'perspective')
}

export function liveAttachments(rows: readonly EntityRow[]): EntityRowOf<'attachment'>[] {
  return liveOf(rows, 'attachment')
}

export function liveTaskTags(rows: readonly EntityRow[]): EntityRowOf<'task_tag'>[] {
  return liveOf(rows, 'task_tag')
}

export function liveAll(rows: readonly EntityRow[]): EntityRow[] {
  return rows.filter(r => !r.deleted)
}

export function findLive<E extends GtdEntity>(
  rows: readonly EntityRow[],
  entity: E,
  id: string,
): EntityRowOf<E> | undefined {
  return rows.find(
    (r): r is EntityRowOf<E> => r.entity === entity && r.id === id && !r.deleted,
  )
}

/** task 的 tagId 列表（从 live task_tag 行聚合） */
export function tagIdsOf(rows: readonly EntityRow[], taskId: string): string[] {
  return liveTaskTags(rows)
    .filter(tt => tt.data.taskId === taskId)
    .map(tt => tt.data.tagId)
}

/** task 的 attachment id 列表（从 live attachment 行聚合） */
export function attachmentIdsOf(rows: readonly EntityRow[], taskId: string): string[] {
  return liveAttachments(rows)
    .filter(a => a.data.taskId === taskId)
    .map(a => a.id)
}

/** 当前 rows 上 live tasks 的树（计算属性；每次现算） */
export function taskTree(rows: readonly EntityRow[]): TaskTree {
  return buildTaskTree(liveTasks(rows))
}

/**
 * RowStore：rows 查询面的对象封装。
 * 持有同一 EntityRow[] 引用时，写路径原地改数组后读仍一致。
 */
export class RowStore {
  private rows: EntityRow[]

  constructor(rows: EntityRow[] = []) {
    this.rows = rows
  }

  /** 全部行（含软删），只读 */
  allRows(): readonly EntityRow[] {
    return this.rows
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

  findLive<E extends GtdEntity>(entity: E, id: string): EntityRowOf<E> | undefined {
    return findLive(this.rows, entity, id)
  }

  tagIdsOf(taskId: string): string[] {
    return tagIdsOf(this.rows, taskId)
  }

  attachmentIdsOf(taskId: string): string[] {
    return attachmentIdsOf(this.rows, taskId)
  }

  liveAll(): EntityRow[] {
    return liveAll(this.rows)
  }

  /** live tasks 树（计算属性） */
  taskTree(): TaskTree {
    return taskTree(this.rows)
  }
}
