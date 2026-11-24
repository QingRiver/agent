import type { Op, OpIds } from '../command/op'
import type { GtdModel } from '../state/model'
import { deleteOp, update } from '../command/op'

/**
 * OF4 Inherited Tags Assignment：目标无标时复制父 task_tag；已有标不覆盖。
 * 新建可传 ownTagIds=[]。
 */
export function copyTagsFromParentOp(
  reader: GtdModel,
  taskId: string,
  parentId: string | null | undefined,
  ownTagIds?: readonly string[],
  ids?: OpIds,
): Op[] {
  if (parentId == null)
    return []
  const own = ownTagIds ?? reader.tagIdsOf(taskId)
  if (own.length > 0)
    return []
  return reader.tagIdsOf(parentId).map(tagId =>
    update('task_tag', `${taskId}|${tagId}`, { taskId, tagId }, ids),
  )
}

/** 设置任务标签集合：diff → task_tag upsert/delete */
export function planSetTaskTagsOp(
  reader: GtdModel,
  taskId: string,
  tagIds: string[],
  ids?: OpIds,
): Op[] {
  const task = reader.findLive('task', taskId)
  if (!task)
    throw new Error('任务不存在')
  const current = reader.tagIdsOf(taskId)
  const next = new Set(tagIds)
  const items: Op[] = []
  for (const tagId of tagIds) {
    if (!current.includes(tagId))
      items.push(update('task_tag', `${taskId}|${tagId}`, { taskId, tagId }, ids))
  }
  for (const tagId of current) {
    if (!next.has(tagId))
      items.push(deleteOp('task_tag', `${taskId}|${tagId}`, ids))
  }
  return items
}
