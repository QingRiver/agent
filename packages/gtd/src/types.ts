/**
 * @agent/gtd 枚举常量中心。
 *
 * 所有枚举值以 `as const` 对象为唯一来源（语义 key + JSDoc + 中文 TEXT 映射），
 * `schema.ts` 的 zod enum 从这些 const object 派生，TS type 由 zod `z.infer` 派生。
 * 不在此处导出 enum type，避免与 schema.ts 重复导出冲突。
 */

// ===== 设定状态（显式，持久化；Task/Project 共用，Task 不应取 ON_HOLD，由不变量约束） =====
export const EXPLICIT_STATUS = {
  /** 活跃 */
  ACTIVE: 'active',
  /** 已暂停（仅 Project） */
  ON_HOLD: 'on_hold',
  /** 已完成 */
  COMPLETED: 'completed',
  /** 已取消（dropped，可恢复） */
  CANCELLED: 'cancelled',
  /** 已删除 */
  DELETED: 'deleted',
} as const

export const EXPLICIT_STATUS_TEXT = {
  [EXPLICIT_STATUS.ACTIVE]: '活跃',
  [EXPLICIT_STATUS.ON_HOLD]: '暂停',
  [EXPLICIT_STATUS.COMPLETED]: '已完成',
  [EXPLICIT_STATUS.CANCELLED]: '已取消',
  [EXPLICIT_STATUS.DELETED]: '已删除',
} as const

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

// ===== 文件夹状态 =====
export const FOLDER_STATUS = {
  /** 活跃 */
  ACTIVE: 'active',
  /** 已放弃 */
  DROPPED: 'dropped',
} as const

export const FOLDER_STATUS_TEXT = {
  [FOLDER_STATUS.ACTIVE]: '活跃',
  [FOLDER_STATUS.DROPPED]: '已放弃',
} as const

// ===== 分组类型 =====
export const GROUP_TYPE = {
  /** 顺序：前序完成才可用下一项 */
  SEQUENTIAL: 'sequential',
  /** 并行：全部可用 */
  PARALLEL: 'parallel',
  /** 单动作清单 */
  SINGLE_ACTION: 'singleAction',
} as const

export const GROUP_TYPE_TEXT = {
  [GROUP_TYPE.SEQUENTIAL]: '顺序',
  [GROUP_TYPE.PARALLEL]: '并行',
  [GROUP_TYPE.SINGLE_ACTION]: '单动作清单',
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

// ===== 回顾周期 =====
export const REVIEW_INTERVAL = {
  /** 每周 */
  WEEKLY: 'weekly',
  /** 每两周 */
  BIWEEKLY: 'biweekly',
  /** 每月 */
  MONTHLY: 'monthly',
  /** 每季度 */
  QUARTERLY: 'quarterly',
  /** 每年 */
  YEARLY: 'yearly',
  /** 自定义 */
  CUSTOM: 'custom',
} as const

export const REVIEW_INTERVAL_TEXT = {
  [REVIEW_INTERVAL.WEEKLY]: '每周',
  [REVIEW_INTERVAL.BIWEEKLY]: '每两周',
  [REVIEW_INTERVAL.MONTHLY]: '每月',
  [REVIEW_INTERVAL.QUARTERLY]: '每季度',
  [REVIEW_INTERVAL.YEARLY]: '每年',
  [REVIEW_INTERVAL.CUSTOM]: '自定义',
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

// ===== 可用性过滤档 =====
export const AVAILABILITY_FILTER = {
  /** 仅可执行 */
  AVAILABLE: 'available',
  /** 所有未完成 */
  REMAINING: 'remaining',
  /** 全部 */
  ALL: 'all',
} as const

export const AVAILABILITY_FILTER_TEXT = {
  [AVAILABILITY_FILTER.AVAILABLE]: '仅可执行',
  [AVAILABILITY_FILTER.REMAINING]: '未完成',
  [AVAILABILITY_FILTER.ALL]: '全部',
} as const

// ===== 过滤字段 =====
export const FILTER_FIELD = {
  /** 状态 */
  STATUS: 'status',
  /** 项目 */
  PROJECT: 'project',
  /** 文件夹 */
  FOLDER: 'folder',
  /** 标签 */
  TAG: 'tag',
  /** 推迟日 */
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
  [FILTER_FIELD.FOLDER]: '文件夹',
  [FILTER_FIELD.TAG]: '标签',
  [FILTER_FIELD.DEFER_DATE]: '推迟日',
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
  /** 按文件夹 */
  FOLDER: 'folder',
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
  [GROUP_KEY.FOLDER]: '文件夹',
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
