import { z } from 'zod'
import {
  ATTACHMENT_KIND,
  AVAILABILITY_FILTER,
  COMPUTED_STATUS,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FILTER_OP,
  FOLDER_STATUS,
  GROUP_KEY,
  GROUP_TYPE,
  PERSPECTIVE_MATCH,
  REPEAT_ANCHOR,
  REPEAT_CYCLE,
  REVIEW_INTERVAL,
  SORT_DIR,
  SORT_FIELD,
} from './types'

/**
 * @agent/gtd 数据结构 spec —— zod schema 为唯一来源。
 *
 * 设计原则：
 * - 整个 GtdDocument 可序列化为单个 JSON（导入/导出即整体 JSON）。
 * - 实体扁平存储 + id 引用（不深嵌套），运行时按 parentId/folderId/projectId 构建树。
 * - 不涉及 DB / UI；派生状态（COMPUTED_STATUS）不落 JSON，由 availability 实时计算。
 * - 枚举值从 {@link ./types.ts} 的 `as const` 对象派生（语义 key + JSDoc + 中文 TEXT），
 *   zod `z.enum(constObject)` 从中生成 schema，TS type 由 `z.infer` 派生，单一来源不漂移。
 */

// ---------- 枚举 schema（从 const object 派生） ----------

export const ExplicitStatusSchema = z
  .enum(EXPLICIT_STATUS)
  .describe('显式状态（持久化）。Task/Project 共用；Task 不应取 on_hold，由不变量约束。cancelled=dropped 软删可恢复；deleted=硬删')

export const ComputedStatusSchema = z
  .enum(COMPUTED_STATUS)
  .describe('派生状态（实时计算，不持久化不入 JSON）。blocked=不可用；available=可执行；due_soon=临近截止；overdue=已逾期')

export const FolderStatusSchema = z.enum(FOLDER_STATUS).describe('Folder 状态。dropped 整体从视图淡出')

export const GroupTypeSchema = z
  .enum(GROUP_TYPE)
  .describe('sequential=前序完成才可用下一项；parallel=全部可用；singleAction=独立清单。设在 Project 或 action group 上')

export const RepeatCycleSchema = z.enum(REPEAT_CYCLE).describe('重复周期单位')

export const RepeatAnchorSchema = z
  .enum(REPEAT_ANCHOR)
  .describe('下一实例日期基准：completion=本次完成时间；due=旧 dueDate；defer=旧 deferDate')

export const ReviewIntervalSchema = z.enum(REVIEW_INTERVAL).describe('回顾周期')

export const AttachmentKindSchema = z.enum(ATTACHMENT_KIND).describe('附件类型')

export const PerspectiveMatchSchema = z.enum(PERSPECTIVE_MATCH).describe('filterRules 间逻辑：all=AND；any=OR')

export const AvailabilityFilterSchema = z
  .enum(AVAILABILITY_FILTER)
  .describe('可用性过滤档：available=只看能做；remaining=所有未完成；all=含已完成/放弃')

export const FilterFieldSchema = z.enum(FILTER_FIELD).describe('过滤规则字段')

export const FilterOpSchema = z.enum(FILTER_OP).describe('过滤规则运算符')

export const GroupKeySchema = z.enum(GROUP_KEY).describe('分组键，可多级')

export const SortFieldSchema = z.enum(SORT_FIELD).describe('排序字段')

export const SortDirSchema = z.enum(SORT_DIR).describe('排序方向')

// ---------- 公共子类型 ----------

const uuid = z.string().min(1).describe('唯一标识（非空字符串；DB 为 text 列，不强制 uuid 格式，便于测试与导入）')
const datetime = z.string().datetime().describe('ISO 8601 时间戳（UTC）')
const fractionalOrder = z
  .number()
  .describe('同级排序索引，建议 fractional indexing 以避免频繁重排')

// ---------- Folder ----------

export const FolderSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).describe('文件夹名'),
    parentId: uuid.nullable().describe('父 folder id；null=顶层'),
    order: fractionalOrder,
    status: FolderStatusSchema,
    createdAt: datetime,
    updatedAt: datetime.nullable(),
  })
  .describe('组织 Project 的文件夹，可嵌套（parentId 自引用）')

// ---------- Tag ----------

export const TagSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).describe('标签名'),
    parentId: uuid.nullable().describe('父 tag id；null=顶层（OmniFocus 3 tag 树）'),
    order: fractionalOrder,
    color: z.string().nullable().describe('CSS 颜色字符串，如 #3b82f6'),
    createdAt: datetime,
    updatedAt: datetime.nullable(),
  })
  .describe('标签，可嵌套；一个 Task 可挂多个 Tag（经 Task.tagIds 多对多）')

// ---------- RepeatRule ----------

export const RepeatRuleSchema = z
  .object({
    id: uuid,
    cycle: RepeatCycleSchema,
    interval: z
      .number()
      .int()
      .min(1)
      .describe('每 N 个 cycle 重复一次，如 every 2 weeks → interval=2'),
    anchor: RepeatAnchorSchema,
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .describe('weekly 专有：限定星期几，0=周日..6=周六；空数组=不限'),
    endDate: datetime.nullable().describe('到达此日期后不再生成新实例'),
    maxOccurrences: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe('最多生成实例数；null=无限'),
    completedOccurrences: z
      .number()
      .int()
      .min(0)
      .describe('已完成实例计数，达 maxOccurrences 后完成即终结'),
  })
  .describe('重复规则。Task 完成时按本规则克隆下一实例；anchor 决定下一实例日期基准')

// ---------- ReviewConfig ----------

export const ReviewConfigSchema = z
  .object({
    enabled: z.boolean().describe('是否启用回顾'),
    interval: ReviewIntervalSchema,
    customDays: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe('interval=custom 时的天数'),
    lastReviewDate: datetime.nullable().describe('上次回顾时间'),
    nextReviewDate: datetime.describe('由 lastReviewDate + interval 推算；needsReview 的判据'),
    needsReview: z
      .boolean()
      .describe('派生：now >= nextReviewDate。为查询便利可冗余落值，定时刷新'),
  })
  .describe('Project 级回顾配置')

// ---------- Attachment ----------

export const AttachmentSchema = z
  .object({
    id: uuid,
    taskId: uuid.describe('所属 Task id'),
    kind: AttachmentKindSchema,
    url: z.string().describe('附件引用地址'),
    filename: z.string().describe('文件名'),
    createdAt: datetime,
  })
  .describe('Task 附件元数据。spec 阶段仅存引用，不涉及二进制存储')

// ---------- Task ----------

export const TaskSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).describe('动作名'),
    note: z.string().nullable().describe('备注'),
    projectId: uuid.nullable().describe('所属 Project id；null = Inbox 顶层'),
    parentId: uuid.nullable().describe('父 Task id（action group 子项）；null = 项目顶层 action'),
    order: fractionalOrder,
    status: ExplicitStatusSchema.describe('显式状态；Task 不应取 on_hold（由不变量约束）'),
    groupType: GroupTypeSchema.nullable().describe('仅当有子 task(action group)时生效；null=叶子 action'),
    deferDate: datetime.nullable().describe('推迟日，之前派生 blocked'),
    dueDate: datetime.nullable().describe('截止日；过期→overdue，临近→due_soon'),
    completedAt: datetime.nullable(),
    droppedAt: datetime.nullable().describe('cancelled 时间'),
    flagged: z.boolean().describe('旗标'),
    estimateMinutes: z.number().int().min(0).nullable().describe('预估时长（分钟）'),
    repeatRuleId: uuid.nullable().describe('关联 RepeatRule id；null=不重复'),
    tagIds: z.array(uuid).describe('挂载的 Tag id 列表（多对多）'),
    attachmentIds: z.array(uuid).describe('附件 id 列表'),
    repeatedFromTaskId: uuid.nullable().describe('克隆来源 Task id（重复实例追溯）；null=非重复实例'),
    createdAt: datetime,
    updatedAt: datetime,
  })
  .describe('最小执行单元。无 projectId 且无 parentId = Inbox；有子 task 时即 action group')

// ---------- Project ----------

export const ProjectSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).describe('项目名'),
    note: z.string().nullable(),
    folderId: uuid.nullable().describe('所属 Folder id；null=顶层'),
    order: fractionalOrder,
    status: ExplicitStatusSchema.describe('显式状态；on_hold 时其全部子 Task 派生状态强制 blocked'),
    type: GroupTypeSchema.describe('项目类型：sequential/parallel/singleAction'),
    defaultDeferOffset: z.number().int().nullable().describe('新动作默认 defer 偏移（分钟）'),
    defaultDueOffset: z.number().int().nullable().describe('新动作默认 due 偏移（分钟）'),
    defaultTagIds: z.array(uuid).describe('新动作默认 Tag'),
    flagged: z.boolean(),
    review: ReviewConfigSchema,
    createdAt: datetime,
    updatedAt: datetime,
  })
  .describe('一组动作的容器，有状态与类型')

// ---------- Perspective ----------

export const FilterRuleSchema = z
  .object({
    field: FilterFieldSchema,
    op: FilterOpSchema,
    value: z
      .unknown()
      .describe('与 op 配套的值：eq/ne=标量；in=数组；between=[起,止]；before/after=时刻；isNull/isNotNull=忽略'),
  })
  .describe('透视过滤规则')

export const SortKeySchema = z
  .object({
    field: SortFieldSchema,
    dir: SortDirSchema,
  })
  .describe('排序键，组内多级')

export const PerspectiveSchema = z
  .object({
    id: uuid,
    name: z.string().describe('透视名'),
    icon: z.string().nullable().describe('图标标识'),
    matchMode: PerspectiveMatchSchema,
    filterRules: z.array(FilterRuleSchema).describe('过滤规则集合'),
    groupBy: z.array(GroupKeySchema).describe('分组键，多级'),
    sortBy: z.array(SortKeySchema).describe('组内排序，多级'),
    availabilityFilter: AvailabilityFilterSchema,
    showCompleted: z.boolean().describe('是否显示已完成'),
    showDropped: z.boolean().describe('是否显示已放弃'),
    flaggedOnly: z.boolean().nullable().describe('仅旗标；null=不约束'),
    createdAt: datetime,
    updatedAt: datetime.nullable(),
  })
  .describe('透视：可持久化的 过滤+分组+排序 视图规则')

// ---------- Document（整体 JSON） ----------

export const GtdDocumentMetaSchema = z
  .object({
    createdAt: datetime,
    updatedAt: datetime,
    schemaVersion: z.string().describe('数据结构版本号，便于迁移'),
  })
  .describe('文档元信息')

export const GtdDocumentSchema = z
  .object({
    version: z.string().describe('文档版本'),
    meta: GtdDocumentMetaSchema,
    folders: z.array(FolderSchema),
    projects: z.array(ProjectSchema),
    tags: z.array(TagSchema),
    tasks: z.array(TaskSchema),
    perspectives: z.array(PerspectiveSchema),
    repeatRules: z.array(RepeatRuleSchema),
    attachments: z.array(AttachmentSchema),
  })
  .describe('整个 GTD 文档，可整体序列化为单个 JSON；扁平存储 + id 引用')

// ---------- 派生类型 ----------

export type Folder = z.infer<typeof FolderSchema>
export type Tag = z.infer<typeof TagSchema>
export type RepeatRule = z.infer<typeof RepeatRuleSchema>
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>
export type Attachment = z.infer<typeof AttachmentSchema>
export type Task = z.infer<typeof TaskSchema>
export type Project = z.infer<typeof ProjectSchema>
export type FilterRule = z.infer<typeof FilterRuleSchema>
export type SortKey = z.infer<typeof SortKeySchema>
export type Perspective = z.infer<typeof PerspectiveSchema>
export type GtdDocument = z.infer<typeof GtdDocumentSchema>

export type AttachmentKind = z.infer<typeof AttachmentKindSchema>
export type AvailabilityFilter = z.infer<typeof AvailabilityFilterSchema>
export type ComputedStatus = z.infer<typeof ComputedStatusSchema>
export type ExplicitStatus = z.infer<typeof ExplicitStatusSchema>
export type FilterField = z.infer<typeof FilterFieldSchema>
export type FilterOp = z.infer<typeof FilterOpSchema>
export type FolderStatus = z.infer<typeof FolderStatusSchema>
export type GroupKey = z.infer<typeof GroupKeySchema>
export type GroupType = z.infer<typeof GroupTypeSchema>
export type PerspectiveMatch = z.infer<typeof PerspectiveMatchSchema>
export type RepeatAnchor = z.infer<typeof RepeatAnchorSchema>
export type RepeatCycle = z.infer<typeof RepeatCycleSchema>
export type ReviewInterval = z.infer<typeof ReviewIntervalSchema>
export type SortDir = z.infer<typeof SortDirSchema>
export type SortField = z.infer<typeof SortFieldSchema>
