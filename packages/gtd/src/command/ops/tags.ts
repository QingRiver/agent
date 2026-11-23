import type { GtdIntent } from '../../apply/apply'
import type { GtdReader } from '../../data/reader'
import type { IntentIds } from './ids'
import { deleteIntent, upsertIntent } from './builders'

/**
 * OF4 Inherited Tags Assignment：目标无标时复制父 task_tag；已有标不覆盖。
 * 新建可传 ownTagIds=[]。
 */
export function copyTagsFromParentOp(
  reader: GtdReader,
  taskId: string,
  parentId: string | null | undefined,
  ownTagIds?: readonly string[],
  ids?: IntentIds,
): GtdIntent[] {
  if (parentId == null)
    return []
  const own = ownTagIds ?? reader.tagIdsOf(taskId)
  if (own.length > 0)
    return []
  return reader.tagIdsOf(parentId).map(tagId =>
    upsertIntent('task_tag', `${taskId}|${tagId}`, { taskId, tagId }, ids),
  )
}

/** 设置任务标签集合：diff → task_tag upsert/delete */
export function planSetTaskTagsOp(
  reader: GtdReader,
  taskId: string,
  tagIds: string[],
  ids?: IntentIds,
): GtdIntent[] {
  const task = reader.findLive('task', taskId)
  if (!task)
    throw new Error('任务不存在')
  const current = reader.tagIdsOf(taskId)
  const next = new Set(tagIds)
  const items: GtdIntent[] = []
  for (const tagId of tagIds) {
    if (!current.includes(tagId))
      items.push(upsertIntent('task_tag', `${taskId}|${tagId}`, { taskId, tagId }, ids))
  }
  for (const tagId of current) {
    if (!next.has(tagId))
      items.push(deleteIntent('task_tag', `${taskId}|${tagId}`, ids))
  }
  return items
}
