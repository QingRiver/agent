/**
 * 领域级 + 行级数据工厂（共享：单测 + 未来 client Storybook）。
 *
 * - 领域实体：makeTask/makeTag/makeRepeatRule/makeSortKey/makePerspective
 * - 行级（运行时真相）：makeRow/makeTaskRow/makeTaskTagRow
 */
import type {
  Perspective,
  RepeatRule,
  SortKey,
  Tag,
  Task,
} from '../data/schema'
import type { EntityRow, EntityRowOf } from '../data/sync-schema'
import { randomUUID } from 'node:crypto'
import {
  EXPLICIT_STATUS,
  PLANNED_MODE,
  REPEAT_ANCHOR,
  REPEAT_CYCLE,
} from '../data/types'
import { NOW_ISO } from './constants'

// ---------------- 领域实体 ----------------

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: randomUUID(),
    name: 'task',
    note: null,
    mountDirId: null,
    parentId: null,
    order: 0,
    status: EXPLICIT_STATUS.ACTIVE,
    groupType: null,
    deferDate: null,
    dueDate: null,
    plannedMode: PLANNED_MODE.NONE,
    plannedDate: null,
    completedAt: null,
    heldAt: null,
    droppedAt: null,
    flagged: false,
    estimateMinutes: null,
    repeatRuleId: null,
    repeatedFromTaskId: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  }
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: randomUUID(),
    name: 'tag',
    color: null,
    createdAt: NOW_ISO,
    updatedAt: null,
    ...overrides,
  }
}

export function makeRepeatRule(overrides: Partial<RepeatRule> = {}): RepeatRule {
  return {
    id: randomUUID(),
    cycle: REPEAT_CYCLE.WEEKLY,
    interval: 1,
    anchor: REPEAT_ANCHOR.COMPLETION,
    daysOfWeek: [],
    endDate: null,
    maxOccurrences: null,
    completedOccurrences: 0,
    ...overrides,
  }
}

export function makeSortKey(overrides: Partial<SortKey> = {}): SortKey {
  return { field: 'order', dir: 'asc', ...overrides }
}

export function makePerspective(overrides: Partial<Perspective> = {}): Perspective {
  return {
    id: randomUUID(),
    name: 'perspective',
    icon: null,
    filter: null,
    groupBy: [],
    sortBy: [],
    createdAt: NOW_ISO,
    updatedAt: null,
    ...overrides,
  }
}

// ---------------- 行级（Row 模型，运行时真相） ----------------

/** 通用 EntityRow：默认 task 行，Object.assign 覆盖。 */
export function makeRow(opts: Partial<EntityRow> = {}): EntityRow {
  const base = {
    entity: 'task',
    id: 'r1',
    userId: 'u1',
    syncId: 0,
    deleted: false,
    data: {} as EntityRow['data'],
  } as EntityRow
  return Object.assign(base, opts)
}

/**
 * task 行：data 用 TaskRowData（无 tagIds/attachmentIds——走 task_tag/attachment 行）；
 * repeatRule 内联（DB jsonb 视角）。
 */
export function makeTaskRow(
  id: string,
  dataOverrides: Partial<Task> & { repeatRule?: RepeatRule } = {},
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRowOf<'task'> {
  const { repeatRule, ...taskOverrides } = dataOverrides
  const { id: _tid, ...taskFields } = makeTask({ id, ...taskOverrides })
  const data = (repeatRule != null ? { ...taskFields, repeatRule } : taskFields) as EntityRowOf<'task'>['data']
  return {
    entity: 'task',
    id,
    userId: opts.userId ?? 'u1',
    syncId: opts.syncId ?? 0,
    deleted: opts.deleted ?? false,
    data,
  }
}

/** task_tag 关联行：复合 id「taskId|tagId」。 */
export function makeTaskTagRow(
  taskId: string,
  tagId: string,
  opts: Partial<Omit<EntityRow, 'entity' | 'id' | 'data'>> = {},
): EntityRow {
  return makeRow({
    ...opts,
    entity: 'task_tag',
    id: `${taskId}|${tagId}`,
    data: { taskId, tagId },
  })
}
