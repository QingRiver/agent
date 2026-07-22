import type { RowStore } from './rows'
import { EXPLICIT_STATUS } from './types'

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
    if (seen.has(cur)) {
      return { code: 'cycle', message: `${entityLabel} ${id} 的 parent 链成环`, entityId: id }
    }
    seen.add(cur)
    cur = parentOf.get(cur) ?? null
  }
  return null
}

/** 校验全部不变量，返回违反列表（空数组表示合法） */
export function validateInvariants(rowStore: RowStore): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  const tasks = rowStore.liveTasks()
  const projects = rowStore.liveProjects()
  const folders = rowStore.liveFolders()
  const tags = rowStore.liveTags()
  const attachments = rowStore.liveAttachments()

  const taskIds = new Set(tasks.map(t => t.id))
  const projectIds = new Set(projects.map(p => p.id))
  const tagIds = new Set(tags.map(t => t.id))
  const attachmentIds = new Set(attachments.map(a => a.id))
  const folderIds = new Set(folders.map(f => f.id))
  const repeatRuleIds = new Set<string>()
  for (const t of tasks) {
    if (t.data.repeatRule) {
      repeatRuleIds.add(t.data.repeatRule.id)
    }
  }

  for (const t of tasks) {
    if (t.data.status === EXPLICIT_STATUS.ON_HOLD) {
      violations.push({ code: 'task_on_hold', message: `Task ${t.id} 不应处于 on_hold`, entityId: t.id })
    }
    if (t.data.projectId && !projectIds.has(t.data.projectId)) {
      violations.push({ code: 'broken_reference', message: `Task ${t.id} projectId 悬空`, entityId: t.id })
    }
    if (t.data.parentId && !taskIds.has(t.data.parentId)) {
      violations.push({ code: 'broken_reference', message: `Task ${t.id} parentId 悬空`, entityId: t.id })
    }
    if (t.data.parentId && !t.data.projectId) {
      violations.push({ code: 'invalid_inbox', message: `Task ${t.id} 有 parent 但无 project`, entityId: t.id })
    }
    for (const tagId of rowStore.tagIdsOf(t.id)) {
      if (!tagIds.has(tagId)) {
        violations.push({ code: 'broken_reference', message: `Task ${t.id} tagId ${tagId} 悬空`, entityId: t.id })
      }
    }
    for (const attachmentId of rowStore.attachmentIdsOf(t.id)) {
      if (!attachmentIds.has(attachmentId)) {
        violations.push({
          code: 'broken_reference',
          message: `Task ${t.id} attachmentId ${attachmentId} 悬空`,
          entityId: t.id,
        })
      }
    }
    if (t.data.repeatRuleId && !repeatRuleIds.has(t.data.repeatRuleId)) {
      violations.push({
        code: 'broken_reference',
        message: `Task ${t.id} repeatRuleId 悬空`,
        entityId: t.id,
      })
    }
    if (t.data.repeatedFromTaskId && !taskIds.has(t.data.repeatedFromTaskId)) {
      violations.push({
        code: 'invalid_repeat_trace',
        message: `Task ${t.id} repeatedFromTaskId 悬空`,
        entityId: t.id,
      })
    }
    const terminalMissing
      = (t.data.status === EXPLICIT_STATUS.COMPLETED && !t.data.completedAt)
        || ((t.data.status === EXPLICIT_STATUS.CANCELLED
          || t.data.status === EXPLICIT_STATUS.DELETED) && !t.data.droppedAt)
    if (terminalMissing) {
      violations.push({ code: 'missing_terminal_timestamp', message: `Task ${t.id} 终态缺时间戳`, entityId: t.id })
    }
  }

  for (const a of attachments) {
    if (!taskIds.has(a.data.taskId)) {
      violations.push({
        code: 'broken_reference',
        message: `Attachment ${a.id} taskId 悬空`,
        entityId: a.id,
      })
    }
  }

  const taskParentOf = new Map(tasks.map(t => [t.id, t.data.parentId]))
  for (const t of tasks) {
    const cycle = detectCycle(t.id, taskParentOf, 'Task')
    if (cycle) {
      violations.push(cycle)
    }
  }

  const folderParentOf = new Map(folders.map(f => [f.id, f.data.parentId]))
  for (const f of folders) {
    if (f.data.parentId && !folderIds.has(f.data.parentId)) {
      violations.push({
        code: 'broken_reference',
        message: `Folder ${f.id} parentId 悬空`,
        entityId: f.id,
      })
    }
    const cycle = detectCycle(f.id, folderParentOf, 'Folder')
    if (cycle) {
      violations.push(cycle)
    }
  }

  const tagParentOf = new Map(tags.map(t => [t.id, t.data.parentId]))
  for (const tag of tags) {
    if (tag.data.parentId && !tagIds.has(tag.data.parentId)) {
      violations.push({
        code: 'broken_reference',
        message: `Tag ${tag.id} parentId 悬空`,
        entityId: tag.id,
      })
    }
    const cycle = detectCycle(tag.id, tagParentOf, 'Tag')
    if (cycle) {
      violations.push(cycle)
    }
  }

  const orderKeys = new Set<string>()
  for (const t of tasks) {
    const key = `${t.data.projectId ?? ''}|${t.data.parentId ?? ''}|${t.data.order}`
    if (orderKeys.has(key)) {
      violations.push({ code: 'duplicate_order', message: `Task ${t.id} 同级 order 重复`, entityId: t.id })
    }
    else {
      orderKeys.add(key)
    }
  }

  const parentsWithChildren = new Set(
    tasks.map(t => t.data.parentId).filter((p): p is string => p != null),
  )
  for (const t of tasks) {
    if (parentsWithChildren.has(t.id) && !t.data.groupType) {
      violations.push({ code: 'group_type_mismatch', message: `Task ${t.id} 有子项但 groupType 为空`, entityId: t.id })
    }
  }

  return violations
}
