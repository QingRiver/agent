import type { GtdDocument } from './schema'
import { EXPLICIT_STATUS } from './types'

/**
 * 不变量校验（SPEC §4）。返回违反列表，空数组表示合法。
 */

export type InvariantCode
  = | 'broken_reference'
    | 'cycle'
    | 'invalid_inbox'
    | 'group_type_mismatch'
    | 'duplicate_order'
    | 'missing_terminal_timestamp'
    | 'invalid_repeat_trace'
    | 'task_on_hold'

export interface InvariantViolation {
  code: InvariantCode
  message: string
  entityId?: string
}

function detectCycle(
  id: string,
  parentOf: Map<string, string | null>,
  entityLabel: string,
): InvariantViolation | null {
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur) {
    if (seen.has(cur))
      return { code: 'cycle', message: `${entityLabel} ${id} 的 parent 链成环`, entityId: id }
    seen.add(cur)
    cur = parentOf.get(cur) ?? null
  }
  return null
}

/** 校验全部不变量，返回违反列表 */
export function validateInvariants(doc: GtdDocument): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  const taskIds = new Set(doc.tasks.map(t => t.id))
  const projectIds = new Set(doc.projects.map(p => p.id))
  const tagIds = new Set(doc.tags.map(t => t.id))
  const attachmentIds = new Set(doc.attachments.map(a => a.id))
  const repeatRuleIds = new Set(doc.repeatRules.map(r => r.id))
  const folderIds = new Set(doc.folders.map(f => f.id))

  for (const t of doc.tasks) {
    if (t.status === EXPLICIT_STATUS.ON_HOLD)
      violations.push({ code: 'task_on_hold', message: `Task ${t.id} 不应处于 on_hold`, entityId: t.id })
    if (t.projectId && !projectIds.has(t.projectId))
      violations.push({ code: 'broken_reference', message: `Task ${t.id} projectId 悬空`, entityId: t.id })
    if (t.parentId && !taskIds.has(t.parentId))
      violations.push({ code: 'broken_reference', message: `Task ${t.id} parentId 悬空`, entityId: t.id })
    if (t.parentId && !t.projectId)
      violations.push({ code: 'invalid_inbox', message: `Task ${t.id} 有 parent 但无 project`, entityId: t.id })
    for (const tagId of t.tagIds) {
      if (!tagIds.has(tagId))
        violations.push({ code: 'broken_reference', message: `Task ${t.id} tagId ${tagId} 悬空`, entityId: t.id })
    }
    for (const attachmentId of t.attachmentIds) {
      if (!attachmentIds.has(attachmentId)) {
        violations.push({
          code: 'broken_reference',
          message: `Task ${t.id} attachmentId ${attachmentId} 悬空`,
          entityId: t.id,
        })
      }
    }
    if (t.repeatRuleId && !repeatRuleIds.has(t.repeatRuleId)) {
      violations.push({
        code: 'broken_reference',
        message: `Task ${t.id} repeatRuleId 悬空`,
        entityId: t.id,
      })
    }
    if (t.repeatedFromTaskId && !taskIds.has(t.repeatedFromTaskId)) {
      violations.push({
        code: 'invalid_repeat_trace',
        message: `Task ${t.id} repeatedFromTaskId 悬空`,
        entityId: t.id,
      })
    }
    const terminalMissing
      = (t.status === EXPLICIT_STATUS.COMPLETED && !t.completedAt)
        || ((t.status === EXPLICIT_STATUS.CANCELLED
          || t.status === EXPLICIT_STATUS.DELETED) && !t.droppedAt)
    if (terminalMissing)
      violations.push({ code: 'missing_terminal_timestamp', message: `Task ${t.id} 终态缺时间戳`, entityId: t.id })
  }

  for (const a of doc.attachments) {
    if (!taskIds.has(a.taskId)) {
      violations.push({
        code: 'broken_reference',
        message: `Attachment ${a.id} taskId 悬空`,
        entityId: a.id,
      })
    }
  }

  const taskParentOf = new Map(doc.tasks.map(t => [t.id, t.parentId]))
  for (const t of doc.tasks) {
    const cycle = detectCycle(t.id, taskParentOf, 'Task')
    if (cycle)
      violations.push(cycle)
  }

  const folderParentOf = new Map(doc.folders.map(f => [f.id, f.parentId]))
  for (const f of doc.folders) {
    if (f.parentId && !folderIds.has(f.parentId)) {
      violations.push({
        code: 'broken_reference',
        message: `Folder ${f.id} parentId 悬空`,
        entityId: f.id,
      })
    }
    const cycle = detectCycle(f.id, folderParentOf, 'Folder')
    if (cycle)
      violations.push(cycle)
  }

  const tagParentOf = new Map(doc.tags.map(t => [t.id, t.parentId]))
  for (const tag of doc.tags) {
    if (tag.parentId && !tagIds.has(tag.parentId)) {
      violations.push({
        code: 'broken_reference',
        message: `Tag ${tag.id} parentId 悬空`,
        entityId: tag.id,
      })
    }
    const cycle = detectCycle(tag.id, tagParentOf, 'Tag')
    if (cycle)
      violations.push(cycle)
  }

  const orderKeys = new Set<string>()
  for (const t of doc.tasks) {
    const key = `${t.projectId ?? ''}|${t.parentId ?? ''}|${t.order}`
    if (orderKeys.has(key))
      violations.push({ code: 'duplicate_order', message: `Task ${t.id} 同级 order 重复`, entityId: t.id })
    else
      orderKeys.add(key)
  }

  const parentsWithChildren = new Set(
    doc.tasks.map(t => t.parentId).filter((p): p is string => p != null),
  )
  for (const t of doc.tasks) {
    if (parentsWithChildren.has(t.id) && !t.groupType)
      violations.push({ code: 'group_type_mismatch', message: `Task ${t.id} 有子项但 groupType 为空`, entityId: t.id })
  }

  return violations
}
