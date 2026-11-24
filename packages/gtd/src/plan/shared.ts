import type { GroupType } from '../data/schema'
import type { GtdModel } from '../state/model'

/** 把行投影成排序/挂载计算所需的 `{ id, ...data }` 形状。 */
export function tShape(s: { id: string, data: { order: number, groupType?: GroupType | null, mountDirId?: string | null, parentId?: string | null } }) {
  return { id: s.id, ...s.data }
}

/** 取任务，不存在则抛领域错误。 */
export function requireTask(reader: GtdModel, taskId: string) {
  const task = reader.findLive('task', taskId)
  if (!task)
    throw new Error('任务不存在')
  return task
}

/**
 * 同兄弟组（同 mountDirId + 同 parentId）的 live 任务，投影成 `{ id, ...data }`。
 * 供 add/indent/outdent/reorder/move 等排布操作计算同级序。
 * `excludeId` 用于 reorder/move 排除被操作任务自身。
 */
export function siblingsOf(
  reader: GtdModel,
  mountDirId: string | null,
  parentId: string | null,
  excludeId?: string,
) {
  return reader.liveTasks()
    .filter(t => t.data.mountDirId === mountDirId
      && t.data.parentId === parentId
      && t.id !== excludeId)
    .map(tShape)
}
