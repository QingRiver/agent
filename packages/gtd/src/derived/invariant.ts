import type { GtdModel } from '../state/model'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import { siblingKey } from '../state/tree'

type InvariantCode
  = | 'broken_reference'
    | 'cycle'
    | 'invalid_inbox'
    | 'group_type_mismatch'
    | 'duplicate_order'
    | 'missing_terminal_timestamp'
    | 'inconsistent_terminal_timestamp'
    | 'invalid_repeat_trace'
    | 'invalid_planned'
    | 'invalid_defer_due'

export interface InvariantViolation {
  code: InvariantCode
  /** 开发诊断用，含 id 与字段名；面向用户的说明用 INVARIANT_TEXT */
  message: string
  entityId?: string
}

/** 不变量违反的用户可读说明，前面接实体名称。 */
export const INVARIANT_TEXT: Record<InvariantCode, string> = {
  broken_reference: '引用的数据不存在',
  cycle: '会形成循环嵌套',
  invalid_inbox: '收件箱任务不能有父任务',
  group_type_mismatch: '有子任务但不是任务组',
  duplicate_order: '与同级任务的排序位置冲突',
  missing_terminal_timestamp: '状态缺少对应的完成或搁置时间',
  inconsistent_terminal_timestamp: '状态与完成或搁置时间不一致',
  invalid_repeat_trace: '重复来源任务不存在',
  invalid_planned: '计划日期设置不完整',
  invalid_defer_due: '推迟日期晚于截止日期',
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
export function validateInvariants(rowStore: GtdModel): InvariantViolation[] {
  const violations: InvariantViolation[] = []
  const tasks = rowStore.liveTasks()
  const attachments = rowStore.liveAttachments()

  const taskIds = new Set(tasks.map(t => t.id))
  const attachmentIds = new Set(attachments.map(a => a.id))

  for (const t of tasks) {
    // 位置权威在 mountDirId；project 归属经 CatalogProjection.projectOf 注入（非 GtdModel）。
    if (t.data.parentId && !taskIds.has(t.data.parentId)) {
      violations.push({ code: 'broken_reference', message: `Task ${t.id} parentId 悬空`, entityId: t.id })
    }
    // 子任务继承父挂载：有 parentId 必有 mountDirId（Inbox 顶层无 parent）
    if (t.data.parentId && !t.data.mountDirId) {
      violations.push({ code: 'invalid_inbox', message: `Task ${t.id} 有 parent 但无 mountDirId`, entityId: t.id })
    }
    // tag 目录已退出 sync：不在 GtdModel 校验 tagId 是否存在（对齐 mountDirId / dirs）
    for (const attachmentId of rowStore.attachmentIdsOf(t.id)) {
      if (!attachmentIds.has(attachmentId)) {
        violations.push({
          code: 'broken_reference',
          message: `Task ${t.id} attachmentId ${attachmentId} 悬空`,
          entityId: t.id,
        })
      }
    }
    if (t.data.repeatedFromTaskId && !taskIds.has(t.data.repeatedFromTaskId)) {
      violations.push({
        code: 'invalid_repeat_trace',
        message: `Task ${t.id} repeatedFromTaskId 悬空`,
        entityId: t.id,
      })
    }
    const stamp = t.data.statusChangedAt
    const terminal = t.data.status === EXPLICIT_STATUS.COMPLETED
      || t.data.status === EXPLICIT_STATUS.HOLD
      || t.data.status === EXPLICIT_STATUS.DELETED
    if (terminal && stamp == null) {
      violations.push({ code: 'missing_terminal_timestamp', message: `Task ${t.id} 终态缺时间戳`, entityId: t.id })
    }
    const inconsistent = t.data.status === EXPLICIT_STATUS.ACTIVE && stamp != null
    if (inconsistent) {
      violations.push({
        code: 'inconsistent_terminal_timestamp',
        message: `Task ${t.id} 终态时间戳与 status 不一致（status=${String(t.data.status)}）`,
        entityId: t.id,
      })
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

  // 同级 order 唯一：按 mountDirId（位置权威）+ parentId 分组
  const orderKeys = new Set<string>()
  for (const t of tasks) {
    const key = `${siblingKey(t.data.mountDirId, t.data.parentId)}|${t.data.order}`
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
