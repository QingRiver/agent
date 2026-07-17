import type { PerspectiveInput, PerspectiveQuery } from '../perspective-input'
import { PERSPECTIVE_INPUT_ERROR_CODE } from '../perspective-input'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FILTER_OP,
  GROUP_KEY,
  PERSPECTIVE_MATCH,
  SORT_DIR,
  SORT_FIELD,
} from '../types'

/** 固定解析上下文（与 perspective-input 测试共用） */
export const PROMPT_FIXTURE_NOW = new Date('2026-07-16T12:00:00Z')
export const PROMPT_FIXTURE_TIMEZONE = 'Asia/Shanghai'

export const PROMPT_FIXTURE_CONTEXT = {
  now: PROMPT_FIXTURE_NOW,
  timeZone: PROMPT_FIXTURE_TIMEZONE,
  projects: [
    { id: 'proj-renovation', name: '装修' },
    { id: 'proj-work', name: '工作' },
  ],
  folders: [
    { id: 'folder-home', name: '家庭', parentId: null },
  ],
  tags: [
    { id: 'tag-urgent', name: '紧急', parentId: null },
  ],
  builtinPerspectiveIds: ['inbox', 'projects', 'tags', 'forecast', 'flagged', 'review', 'completed', 'predicted'],
}

/** 本周到期且已旗标 — 一次性 Query（相对日期） */
export const QUERY_FLAGGED_DUE_THIS_WEEK: PerspectiveQuery = {
  matchMode: PERSPECTIVE_MATCH.ALL,
  availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
  showCompleted: false,
  showDropped: false,
  flaggedOnly: null,
  filterRules: [
    { field: FILTER_FIELD.FLAGGED, op: FILTER_OP.EQ, value: true },
    {
      field: FILTER_FIELD.DUE_DATE,
      op: FILTER_OP.BETWEEN,
      value: [
        { type: 'relative', value: 'start_of_week' },
        { type: 'relative', value: 'end_of_week' },
      ],
    },
  ],
  groupBy: [],
  sortBy: [{ field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC }],
}

/** 装修项目的所有未完成任务 — 持久透视 */
export const PERSIST_RENOVATION_ACTIVE: PerspectiveInput = {
  name: '装修进行中',
  icon: null,
  matchMode: PERSPECTIVE_MATCH.ALL,
  availabilityFilter: AVAILABILITY_FILTER.REMAINING,
  showCompleted: false,
  showDropped: false,
  flaggedOnly: null,
  filterRules: [
    {
      field: FILTER_FIELD.PROJECT,
      op: FILTER_OP.EQ,
      value: { name: '装修' },
    },
    {
      field: FILTER_FIELD.STATUS,
      op: FILTER_OP.EQ,
      value: EXPLICIT_STATUS.ACTIVE,
    },
  ],
  groupBy: [GROUP_KEY.PROJECT],
  sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
}

/** 未归入项目的 Inbox 整理视图 */
export const PERSIST_INBOX_TRIAGE: PerspectiveInput = {
  name: 'Inbox 整理',
  icon: null,
  matchMode: PERSPECTIVE_MATCH.ALL,
  availabilityFilter: AVAILABILITY_FILTER.REMAINING,
  showCompleted: false,
  showDropped: false,
  flaggedOnly: null,
  filterRules: [
    { field: FILTER_FIELD.PROJECT, op: FILTER_OP.IS_NULL },
  ],
  groupBy: [],
  sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
}

/** 非法：flagged + between */
export const INVALID_FLAGGED_BETWEEN: PerspectiveQuery = {
  matchMode: PERSPECTIVE_MATCH.ALL,
  availabilityFilter: AVAILABILITY_FILTER.ALL,
  showCompleted: false,
  showDropped: false,
  flaggedOnly: null,
  filterRules: [
    {
      field: FILTER_FIELD.FLAGGED,
      op: FILTER_OP.BETWEEN,
      value: [true, false],
    },
  ],
  groupBy: [],
  sortBy: [],
}

export const PROMPT_POSITIVE_FIXTURES = [
  { id: 'query-flagged-due-week', input: QUERY_FLAGGED_DUE_THIS_WEEK, mode: 'query' as const },
  { id: 'persist-renovation', input: PERSIST_RENOVATION_ACTIVE, mode: 'persist' as const },
  { id: 'persist-inbox', input: PERSIST_INBOX_TRIAGE, mode: 'persist' as const },
]

export const PROMPT_NEGATIVE_FIXTURES = [
  {
    id: 'invalid-flagged-between',
    input: INVALID_FLAGGED_BETWEEN,
    mode: 'query' as const,
    expectedCodes: [PERSPECTIVE_INPUT_ERROR_CODE.INVALID_FIELD_OP],
  },
]

export function formatPromptExamplesMarkdown(): string {
  const lines: string[] = []

  lines.push('### 正例')
  for (const fx of PROMPT_POSITIVE_FIXTURES) {
    lines.push(`#### ${fx.id}`)
    lines.push('```json')
    lines.push(JSON.stringify(fx.input, null, 2))
    lines.push('```')
  }

  lines.push('### 反例')
  for (const fx of PROMPT_NEGATIVE_FIXTURES) {
    lines.push(`#### ${fx.id}（预期错误：${fx.expectedCodes.join(', ')}）`)
    lines.push('```json')
    lines.push(JSON.stringify(fx.input, null, 2))
    lines.push('```')
    lines.push('修正：flagged 仅支持 `eq` / `ne` + boolean。')
  }

  return lines.join('\n')
}
