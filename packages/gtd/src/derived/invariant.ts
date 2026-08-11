import type { RowStore } from '../data/rows'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'

type InvariantCode
  = | 'broken_reference'
    | 'cycle'
    | 'invalid_inbox'
    | 'group_type_mismatch'
    | 'duplicate_order'
    | 'missing_terminal_timestamp'
    | 'invalid_repeat_trace'
    | 'invalid_planned'
    | 'invalid_defer_due'
    // transition 级不变量：repeatRuleId != null 的 COMPLETED 不可重开（SP-INV-REPEAT-REOPEN）。
    // 非静态可检：完成即克隆（cloneNextInstance 把 repeatRule+completedOccurrences 继承到新 ACTIVE 实例），
    // 故「非法重开后的 ACTIVE repeat 任务」与「合法新克隆实例」行态不可区分。
    // 执行点在 L5 command/state-machine.ts reopenTask（throw，由 applyPush 捕入 rejected）；
    // 此 code 仅供 §6 不变量表追溯，validateInvariants 不加静态检查以避免误报合法克隆实例。
    | 'repeat_not_reopenable'

interface InvariantViolation {
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
  const tags = rowStore.liveTags()
  const attachments = rowStore.liveAttachments()

  const taskIds = new Set(tasks.map(t => t.id))
  const tagIds = new Set(tags.map(t => t.id))
  const attachmentIds = new Set(attachments.map(a => a.id))
  const repeatRuleIds = new Set<string>()
  for (const t of tasks) {
    if (t.data.repeatRule) {
      repeatRuleIds.add(t.data.repeatRule.id)
    }
  }

  for (const t of tasks) {
    // projectId 是 server 派生冗余缓存（非 LWW），不在此校验；位置权威在 mountDirId。
    if (t.data.parentId && !taskIds.has(t.data.parentId)) {
      violations.push({ code: 'broken_reference', message: `Task ${t.id} parentId 悬空`, entityId: t.id })
    }
    // 子任务继承父挂载：有 parentId 必有 mountDirId（Inbox 顶层无 parent）
    if (t.data.parentId && !t.data.mountDirId) {
      violations.push({ code: 'invalid_inbox', message: `Task ${t.id} 有 parent 但无 mountDirId`, entityId: t.id })
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
        || ((t.data.status === EXPLICIT_STATUS.HOLD
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

  // 同级 order 唯一：按 mountDirId（位置权威）+ parentId 分组，而非已弃用的 projectId 缓存
  const orderKeys = new Set<string>()
  for (const t of tasks) {
    const key = `${t.data.mountDirId ?? ''}|${t.data.parentId ?? ''}|${t.data.order}`
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

  // plannedMode / plannedDate 成对
  for (const t of tasks) {
    const mode = t.data.plannedMode ?? PLANNED_MODE.NONE
    const date = t.data.plannedDate
    if (mode === PLANNED_MODE.ON && date == null) {
      violations.push({
        code: 'invalid_planned',
        message: `Task ${t.id} plannedMode=on 但 plannedDate 为空`,
        entityId: t.id,
      })
    }
    if ((mode === PLANNED_MODE.NONE || mode === PLANNED_MODE.ROLLING) && date != null) {
      violations.push({
        code: 'invalid_planned',
        message: `Task ${t.id} plannedMode=${mode} 但 plannedDate 非空`,
        entityId: t.id,
      })
    }
    if (t.data.deferDate != null && t.data.dueDate != null) {
      if (new Date(t.data.deferDate).getTime() > new Date(t.data.dueDate).getTime()) {
        violations.push({
          code: 'invalid_defer_due',
          message: `Task ${t.id} deferDate 晚于 dueDate`,
          entityId: t.id,
        })
      }
    }
  }

  return violations
}
