import type { FilterNode } from '../view/filter/schema'
import type {
  COMPUTED_STATUS,
} from './types'
import { z } from 'zod'
import {
  ATTACHMENT_KIND,
  EXPLICIT_STATUS,
  GROUP_KEY,
  GROUP_TYPE,
  PLANNED_MODE,
  REPEAT_ANCHOR,
  REPEAT_CYCLE,
  SORT_DIR,
  SORT_FIELD,
} from './types'

/**
 * @agent/gtd 数据结构 spec —— zod schema 为唯一来源。
 *
 * 设计原则：
 * - 运行时真相为行级 EntityRow[]；导入导出见 data/serialize.ts（v2.0.0）。
 * - 实体扁平存储 + id 引用（不深嵌套），运行时按 parentId/mountDirId 构建树。
 * - 不涉及 DB / UI；派生状态（COMPUTED_STATUS）不落 JSON，由 availability 实时计算。
 * - 枚举值从 {@link ./types.ts} 的 `as const` 对象派生（语义 key + JSDoc + 中文 TEXT），
 *   zod `z.enum(constObject)` 从中生成 schema，TS type 由 `z.infer` 派生，单一来源不漂移。
 */

// ---------- 枚举 schema（从 const object 派生） ----------

export const ExplicitStatusSchema = z
  .enum(EXPLICIT_STATUS)
  .describe('显式状态（持久化）。Task/Project 共用；hold=dropped 软删可恢复；deleted=硬删')

const GroupTypeSchema = z
  .enum(GROUP_TYPE)
  .describe('sequential=前序完成才可用下一项；parallel=全部可用。设在 Project 或 action group 上')

const RepeatCycleSchema = z.enum(REPEAT_CYCLE).describe('重复周期单位')

const RepeatAnchorSchema = z
  .enum(REPEAT_ANCHOR)
  .describe('下一实例日期基准：completion=本次完成时间；due=旧 dueDate；defer=旧 deferDate')

const AttachmentKindSchema = z.enum(ATTACHMENT_KIND).describe('附件类型')

export const GroupKeySchema = z.enum(GROUP_KEY).describe('分组键，可多级')

export const SortFieldSchema = z.enum(SORT_FIELD).describe('排序字段')

export const SortDirSchema = z.enum(SORT_DIR).describe('排序方向')

// ---------- 公共子类型 ----------

const uuid = z.string().min(1).describe('唯一标识（非空字符串；DB 为 text 列，不强制 uuid 格式，便于测试与导入）')
const datetime = z.string().datetime().describe('ISO 8601 时间戳（UTC）')
const fractionalOrder = z
  .number()
  .describe('同级排序索引，建议 fractional indexing 以避免频繁重排')

// ---------- Tag ----------

export const TagSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).describe('标签名'),
    color: z.string().nullable().describe('CSS 颜色字符串，如 #3b82f6'),
    createdAt: datetime,
    updatedAt: datetime.nullable(),
  })
  .describe('扁平标签目录（REST）；Task 经 task_tag 行多对多绑定')

const PlannedModeSchema = z.enum(PLANNED_MODE).default(PLANNED_MODE.NONE)

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
    mountDirId: uuid.nullable().describe('挂载 dir id（权威）；null = Inbox。task 经此挂载到统一 dirs 树节点'),
    parentId: uuid.nullable().describe('父 Task id（action group 子项）；null = 项目顶层 action'),
    order: fractionalOrder,
    status: ExplicitStatusSchema.describe('显式状态'),
    groupType: GroupTypeSchema.nullable().describe('仅当有子 task(action group)时生效；null=叶子 action'),
    deferDate: datetime.nullable().describe('推迟日，之前派生 blocked'),
    dueDate: datetime.nullable().describe('截止日；过期→overdue，临近→due_soon'),
    plannedMode: PlannedModeSchema.describe('计划：none / on(具体日) / rolling(每日滚到今日)；不影响 computed 着色'),
    plannedDate: datetime.nullable().default(null).describe('仅 plannedMode=on 时有值'),
    completedAt: datetime.nullable(),
    heldAt: datetime.nullable().describe('搁置（hold）时间'),
    droppedAt: datetime.nullable().describe('进回收站（deleted/trashed）时间'),
    flagged: z.boolean().describe('旗标'),
    estimateMinutes: z.number().int().min(0).nullable().describe('预估时长（分钟）'),
    repeatRuleId: uuid.nullable().describe('关联 RepeatRule id；null=不重复'),
    repeatedFromTaskId: uuid.nullable().describe('克隆来源 Task id（重复实例追溯）；null=非重复实例'),
    createdAt: datetime,
    updatedAt: datetime,
  })
  .describe('最小执行单元。无 mountDirId 且无 parentId = Inbox；有子 task 时即 action group。标签/附件走 task_tag / attachment 行')

// ---------- Perspective ----------

const SortKeySchema = z
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
    // data 层不依赖 FilterNodeSchema（避免 data↔view 循环）；边界用 validateFilterNode 解析
    filter: z.unknown().nullable().describe('可嵌套 JSON DSL 过滤树；null=无过滤；运行时经 view/filter 校验'),
    groupBy: z.array(GroupKeySchema).describe('分组键，多级'),
    sortBy: z.array(SortKeySchema).describe('组内排序，多级'),
    createdAt: datetime,
    updatedAt: datetime.nullable(),
  })
  .describe('透视：可持久化的 过滤+分组+排序 视图规则')

// ---------- 派生类型 ----------

export type Tag = z.infer<typeof TagSchema>
export type RepeatRule = z.infer<typeof RepeatRuleSchema>
export type Attachment = z.infer<typeof AttachmentSchema>
export type Task = z.infer<typeof TaskSchema>
export type SortKey = z.infer<typeof SortKeySchema>
/** filter 在边界校验后为 FilterNode；zod 存 unknown 避免 data→view 值导入 */
export type Perspective = Omit<z.infer<typeof PerspectiveSchema>, 'filter'> & {
  filter: FilterNode | null
}

export type ComputedStatus = (typeof COMPUTED_STATUS)[keyof typeof COMPUTED_STATUS]
export type GroupKey = z.infer<typeof GroupKeySchema>
export type GroupType = z.infer<typeof GroupTypeSchema>
export type RepeatCycle = z.infer<typeof RepeatCycleSchema>
