/**
 * 重放得到的副本状态：服务器、每台设备的已确认部分、设备界面的预测，都是同一种结构。
 * 只由 replay.ts 的 applyTransaction 推进；读出给 UI / 查询用 materialize。
 */
import type { EntityRow, EntityRowOf, SyncEntity } from '../data/sync-schema'
import { effectiveMountDirId } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'

export interface ReplicaRow {
  entity: SyncEntity
  id: string
  data: Record<string, unknown>
  /** 最后一次写到这一行的事务 seq。 */
  lastSeq: number
}

export interface ReplicaState {
  userId: string
  /** 已重放到的事务 seq。 */
  seq: number
  rows: ReadonlyMap<string, ReplicaRow>
  /** 已永久删除的 task id。之后对这些 id 的任何写入都被忽略。 */
  tombstones: ReadonlySet<string>
  /** 每台设备已重放到的 clientSeq；服务器据此判断重发与缺号，设备据此丢掉已确认的本地事务。 */
  clientSeqs: ReadonlyMap<string, number>
}

export function rowKey(entity: SyncEntity, id: string): string {
  return `${entity}:${id}`
}

export function emptyReplica(userId: string): ReplicaState {
  return { userId, seq: 0, rows: new Map(), tombstones: new Set(), clientSeqs: new Map() }
}

export interface MaterializeOptions {
  /** 标签目录里仍存在的标签；返回 false 的 task_tag 不输出。缺省视为都存在。 */
  isTagLive?: (tagId: string) => boolean
  /** 仍可挂载任务的目录；返回 false 的挂载视为收件箱。缺省视为都有效。 */
  isMountValid?: (dirId: string) => boolean
}

/**
 * 输出给领域读路径的 EntityRow[]（syncId = lastSeq），按 entity、id 排序。
 * - task 的 mountDirId 输出为有效挂载：取根任务的挂载，失效则为 null（收件箱）。
 * - 指向不存在任务的 task_tag / attachment 不输出；死标签按 isTagLive 过滤。
 */
export function materialize(state: ReplicaState, options: MaterializeOptions = {}): EntityRow[] {
  const isTagLive = options.isTagLive ?? (() => true)
  const out: EntityRow[] = []
  for (const row of state.rows.values()) {
    if (row.entity === 'task_tag' || row.entity === 'attachment') {
      const taskId = row.data.taskId as string
      if (!state.rows.has(rowKey('task', taskId)))
        continue
      if (row.entity === 'task_tag' && !isTagLive(row.data.tagId as string))
        continue
    }
    out.push({
      entity: row.entity,
      id: row.id,
      userId: state.userId,
      syncId: row.lastSeq,
      deleted: false,
      data: { ...row.data },
    } as EntityRow)
  }
  const tasks = out.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
  const tree = buildTaskTree(tasks)
  const mounts = new Map(tasks.map(t => [t.id, effectiveMountDirId(t, tree, options.isMountValid)]))
  for (const task of tasks)
    task.data.mountDirId = mounts.get(task.id) ?? null
  return out.sort((a, b) => compareCodeUnits(rowKey(a.entity, a.id), rowKey(b.entity, b.id)))
}

/** 与语言环境无关的排序，各设备结果一致。 */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
