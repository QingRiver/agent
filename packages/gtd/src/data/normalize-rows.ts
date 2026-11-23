/**
 * 读路径投影：对已持久化的 EntityRow[] 做挂载/标签过滤，供 UI 使用。
 */
import type { EntityRow, EntityRowOf } from './row-schema'
import { liveTasks } from '../state/model'
import { buildTaskTree, effectiveMountDirId } from '../state/tree'

export interface NormalizeRowsOptions {
  /** 标签目录里仍存在的标签；返回 false 的 task_tag 不输出。缺省视为都存在。 */
  isTagLive?: (tagId: string) => boolean
  /** 仍可挂载任务的目录；返回 false 的挂载视为收件箱。缺省视为都有效。 */
  isMountValid?: (dirId: string) => boolean
}

function rowKey(entity: string, id: string): string {
  return `${entity}:${id}`
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 过滤并规范化行供领域读路径使用：
 * - 指向不存在任务的 task_tag / attachment 不输出
 * - 死标签按 isTagLive 过滤
 * - task 的 mountDirId 取根任务有效挂载，失效则为 null
 */
export function normalizeRows(rows: EntityRow[], options: NormalizeRowsOptions = {}): EntityRow[] {
  const isTagLive = options.isTagLive ?? (() => true)
  const byTask = new Set(liveTasks(rows).map(r => r.id))
  const out: EntityRow[] = []
  for (const row of rows) {
    if (row.deleted && row.entity !== 'task')
      continue
    if (row.entity === 'task_tag' || row.entity === 'attachment') {
      if (!byTask.has(row.data.taskId))
        continue
      if (row.entity === 'task_tag' && !isTagLive(row.data.tagId))
        continue
    }
    out.push({
      ...row,
      data: { ...row.data },
    } as EntityRow)
  }
  // 含软删 task：挂载继承需看见回收站祖先；不可用 liveTaskTree
  const tasks = out.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
  const tree = buildTaskTree(tasks)
  const mounts = new Map(tasks.map(t => [t.id, effectiveMountDirId(t, tree, options.isMountValid)]))
  for (const task of tasks)
    task.data.mountDirId = mounts.get(task.id) ?? null
  return out.sort((a, b) => compareCodeUnits(rowKey(a.entity, a.id), rowKey(b.entity, b.id)))
}
