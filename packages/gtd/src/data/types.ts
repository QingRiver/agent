/**
 * @agent/gtd 枚举常量中心。
 *
 * 所有枚举值以 `as const` 对象为唯一来源（语义 key + JSDoc + 中文 TEXT 映射），
 * `schema.ts` 的 zod enum 从这些 const object 派生，TS type 由 zod `z.infer` 派生。
 * 不在此处导出 enum type，避免与 schema.ts 重复导出冲突。
 */

// ===== 设定状态（显式，持久化；Task/Project 共用） =====
export const EXPLICIT_STATUS = {
  /** 活跃 */
  ACTIVE: 'active',
  /** 已完成 */
  COMPLETED: 'completed',
  /** 已搁置（dropped，可恢复） */
  HOLD: 'hold',
  /** 已删除 */
  DELETED: 'deleted',
} as const

export const EXPLICIT_STATUS_TEXT = {
  [EXPLICIT_STATUS.ACTIVE]: '活跃',
  [EXPLICIT_STATUS.COMPLETED]: '已完成',
  [EXPLICIT_STATUS.HOLD]: '搁置',
  /** 产品语义 = 回收站（trashed）；wire 值仍为 deleted */
  [EXPLICIT_STATUS.DELETED]: '回收站',
} as const

/** 显式状态值类型（active/completed/hold/deleted）。 */
export type ExplicitStatusValue = (typeof EXPLICIT_STATUS)[keyof typeof EXPLICIT_STATUS]

// ===== 计算状态（派生，不持久化，实时计算） =====
export const COMPUTED_STATUS = {
  /** 阻塞 */
  BLOCKED: 'blocked',
  /** 可执行 */
  AVAILABLE: 'available',
  /** 即将到期 */
  DUE_SOON: 'due_soon',
  /** 已逾期 */
  OVERDUE: 'overdue',
} as const

export const COMPUTED_STATUS_TEXT = {
  [COMPUTED_STATUS.BLOCKED]: '阻塞',
  [COMPUTED_STATUS.AVAILABLE]: '可执行',
  [COMPUTED_STATUS.DUE_SOON]: '即将到期',
  [COMPUTED_STATUS.OVERDUE]: '已逾期',
} as const

// ===== 分组类型 =====
export const GROUP_TYPE = {
  /** 顺序：前序完成才可用下一项 */
  SEQUENTIAL: 'sequential',
  /** 并行：全部可用 */
  PARALLEL: 'parallel',
} as const

export const GROUP_TYPE_TEXT = {
  [GROUP_TYPE.SEQUENTIAL]: '顺序',
  [GROUP_TYPE.PARALLEL]: '并行',
} as const

// ===== 重复周期 =====
export const REPEAT_CYCLE = {
  /** 每日 */
  DAILY: 'daily',
  /** 每周 */
  WEEKLY: 'weekly',
  /** 每月 */
  MONTHLY: 'monthly',
  /** 每年 */
  YEARLY: 'yearly',
} as const

export const REPEAT_CYCLE_TEXT = {
  [REPEAT_CYCLE.DAILY]: '每日',
  [REPEAT_CYCLE.WEEKLY]: '每周',
  [REPEAT_CYCLE.MONTHLY]: '每月',
  [REPEAT_CYCLE.YEARLY]: '每年',
} as const

// ===== 重复锚点（下一实例日期基准） =====
export const REPEAT_ANCHOR = {
  /** 按完成时间 */
  COMPLETION: 'completion',
  /** 按截止日 */
  DUE: 'due',
  /** 按推迟日 */
  DEFER: 'defer',
} as const

export const REPEAT_ANCHOR_TEXT = {
  [REPEAT_ANCHOR.COMPLETION]: '按完成时间',
  [REPEAT_ANCHOR.DUE]: '按截止日',
  [REPEAT_ANCHOR.DEFER]: '按推迟日',
} as const

// ===== 附件类型 =====
export const ATTACHMENT_KIND = {
  /** 文件 */
  FILE: 'file',
  /** 图片 */
  IMAGE: 'image',
  /** 音频 */
  AUDIO: 'audio',
  /** 链接 */
  LINK: 'link',
} as const

export const ATTACHMENT_KIND_TEXT = {
  [ATTACHMENT_KIND.FILE]: '文件',
  [ATTACHMENT_KIND.IMAGE]: '图片',
  [ATTACHMENT_KIND.AUDIO]: '音频',
  [ATTACHMENT_KIND.LINK]: '链接',
} as const

// ===== 透视规则匹配模式 =====
// 已迁至 ./filter/schema.ts 的 LOGIC_OP（and/or/not 可嵌套）

// ===== 可用性过滤档（视图谓词；applyBaseFilter 唯一顶层轴） =====
export const AVAILABILITY_FILTER = {
  /** explicit=active ∧ actionable(computed) */
  AVAILABLE: 'available',
  /** explicit=active（含 blocked 的 active） */
  REMAINING: 'remaining',
  /** 全部 explicit 状态 */
  ALL: 'all',
} as const

export const AVAILABILITY_FILTER_TEXT = {
  [AVAILABILITY_FILTER.AVAILABLE]: '可执行',
  [AVAILABILITY_FILTER.REMAINING]: '未完成',
  [AVAILABILITY_FILTER.ALL]: '全部',
} as const

export type AvailabilityFilter = (typeof AVAILABILITY_FILTER)[keyof typeof AVAILABILITY_FILTER]

const AVAILABILITY_FILTER_SET = new Set<string>(Object.values(AVAILABILITY_FILTER))

export function isAvailabilityFilter(value: unknown): value is AvailabilityFilter {
  return typeof value === 'string' && AVAILABILITY_FILTER_SET.has(value)
}

/** overlay scope 缺省；自定义透视渲染同理 */
export const DEFAULT_AVAILABILITY_FILTER = AVAILABILITY_FILTER.REMAINING

// ===== 内置透视（id 稳定、不落库；name 为默认 UI 文案） =====
export const BUILTIN_PERSPECTIVE_ID = {
  FORECAST: 'forecast',
  INBOX: 'inbox',
  PROJECTS: 'projects',
  TAGS: 'tags',
  FLAGGED: 'flagged',
  COMPLETED: 'completed',
  /** 已搁置（status=hold） */
  HOLD: 'hold',
  /** 回收站（status=deleted ≡ trashed） */
  TRASH: 'trash',
  /** 全部（无 DSL 过滤；含完成/搁置需 View Options 切到 all） */
  ALL: 'all',
} as const

export type BuiltinPerspectiveId = (typeof BUILTIN_PERSPECTIVE_ID)[keyof typeof BUILTIN_PERSPECTIVE_ID]

export const BUILTIN_PERSPECTIVE_NAME: Record<BuiltinPerspectiveId, string> = {
  [BUILTIN_PERSPECTIVE_ID.FORECAST]: '预测',
  [BUILTIN_PERSPECTIVE_ID.INBOX]: '收件箱',
  [BUILTIN_PERSPECTIVE_ID.PROJECTS]: '项目',
  [BUILTIN_PERSPECTIVE_ID.TAGS]: '标签',
  [BUILTIN_PERSPECTIVE_ID.FLAGGED]: '旗标',
  [BUILTIN_PERSPECTIVE_ID.COMPLETED]: '已完成',
  [BUILTIN_PERSPECTIVE_ID.HOLD]: '已搁置',
  [BUILTIN_PERSPECTIVE_ID.TRASH]: '回收站',
  [BUILTIN_PERSPECTIVE_ID.ALL]: '全部',
}

/** 内置透视 id 列表（校验 reserved id 等） */
export const BUILTIN_PERSPECTIVE_IDS = Object.values(BUILTIN_PERSPECTIVE_ID) as BuiltinPerspectiveId[]

const BUILTIN_PERSPECTIVE_ID_SET = new Set<string>(BUILTIN_PERSPECTIVE_IDS)

export function isBuiltinPerspectiveId(id: string): id is BuiltinPerspectiveId {
  return BUILTIN_PERSPECTIVE_ID_SET.has(id)
}

// ===== 过滤字段 =====
export const FILTER_FIELD = {
  /** 状态 */
  STATUS: 'status',
  /** 项目 */
  PROJECT: 'project',
  /** 标签 */
  TAG: 'tag',
  /** 解锁日/推迟日 */
  DEFER_DATE: 'deferDate',
  /** 截止日 */
  DUE_DATE: 'dueDate',
  /** 旗标 */
  FLAGGED: 'flagged',
  /** 预估时长 */
  ESTIMATE: 'estimate',
} as const

export const FILTER_FIELD_TEXT = {
  [FILTER_FIELD.STATUS]: '状态',
  [FILTER_FIELD.PROJECT]: '项目',
  [FILTER_FIELD.TAG]: '标签',
  [FILTER_FIELD.DEFER_DATE]: '解锁日',
  [FILTER_FIELD.DUE_DATE]: '截止日',
  [FILTER_FIELD.FLAGGED]: '旗标',
  [FILTER_FIELD.ESTIMATE]: '预估时长',
} as const

// ===== 过滤运算符 =====
// 已迁至 ./filter/schema.ts 的 LEAF_OP / LOGIC_OP（可嵌套 DSL）

// ===== 分组键 =====
export const GROUP_KEY = {
  /** 按项目 */
  PROJECT: 'project',
  /** 按标签 */
  TAG: 'tag',
  /** 按推迟日 */
  DEFER_DATE: 'deferDate',
  /** 按截止日 */
  DUE_DATE: 'dueDate',
  /** 按旗标 */
  FLAGGED: 'flagged',
  /** 按状态 */
  STATUS: 'status',
  /** 不分组 */
  NONE: 'none',
} as const

export const GROUP_KEY_TEXT = {
  [GROUP_KEY.PROJECT]: '项目',
  [GROUP_KEY.TAG]: '标签',
  [GROUP_KEY.DEFER_DATE]: '推迟日',
  [GROUP_KEY.DUE_DATE]: '截止日',
  [GROUP_KEY.FLAGGED]: '旗标',
  [GROUP_KEY.STATUS]: '状态',
  [GROUP_KEY.NONE]: '不分组',
} as const

// ===== 排序字段 =====
export const SORT_FIELD = {
  /** 截止日 */
  DUE_DATE: 'dueDate',
  /** 推迟日 */
  DEFER_DATE: 'deferDate',
  /** 旗标 */
  FLAGGED: 'flagged',
  /** 预估时长 */
  ESTIMATE: 'estimate',
  /** 创建时间 */
  ADDED_AT: 'addedAt',
  /** 名称 */
  NAME: 'name',
  /** 顺序 */
  ORDER: 'order',
} as const

export const SORT_FIELD_TEXT = {
  [SORT_FIELD.DUE_DATE]: '截止日',
  [SORT_FIELD.DEFER_DATE]: '推迟日',
  [SORT_FIELD.FLAGGED]: '旗标',
  [SORT_FIELD.ESTIMATE]: '预估时长',
  [SORT_FIELD.ADDED_AT]: '创建时间',
  [SORT_FIELD.NAME]: '名称',
  [SORT_FIELD.ORDER]: '顺序',
} as const

// ===== 计划模式（Planned；替代 Forecast Tag） =====
export const PLANNED_MODE = {
  /** 无计划 */
  NONE: 'none',
  /** 计划在具体日 */
  ON: 'on',
  /** 每日滚到今日 */
  ROLLING: 'rolling',
} as const

export const PLANNED_MODE_TEXT = {
  [PLANNED_MODE.NONE]: '无',
  [PLANNED_MODE.ON]: '计划日',
  [PLANNED_MODE.ROLLING]: '滚动到今日',
} as const

/** Forecast 顶栏三段（有序；连续多选）：过去 / 现在 / 以后 */
export const FORECAST_STRIP = {
  PAST: 'past',
  NOW: 'now',
  LATER: 'later',
} as const

export const FORECAST_STRIP_TEXT = {
  [FORECAST_STRIP.PAST]: '过去',
  [FORECAST_STRIP.NOW]: '现在',
  [FORECAST_STRIP.LATER]: '以后',
} as const

/** 三段下标顺序（连续多选约束用） */
export const FORECAST_STRIP_ORDER = [
  FORECAST_STRIP.PAST,
  FORECAST_STRIP.NOW,
  FORECAST_STRIP.LATER,
] as const

// ===== 排序方向 =====
export const SORT_DIR = {
  /** 升序 */
  ASC: 'asc',
  /** 降序 */
  DESC: 'desc',
} as const

export const SORT_DIR_TEXT = {
  [SORT_DIR.ASC]: '升序',
  [SORT_DIR.DESC]: '降序',
} as const
