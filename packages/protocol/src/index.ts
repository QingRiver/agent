/**
 * 中性中断协议 —— 交互层一等公民。
 *
 * 本包定义 agent 执行过程中"中断 → 恢复"的**中性**类型，不绑定任何特定中断源
 * (CLI Effect interact / langgraph interrupt / 未来 hooks 事件中断)。各中断源各自
 * 做一层薄映射到此处，核心协议稳定不动。
 *
 * 设计要点:
 *  - `interruptId` 是恢复路由的唯一依据:多源/并发中断时,响应靠 id 匹配回正确中断点。
 *  - 本期仅做"中断/恢复过程"对齐 + id 穿通,**不含持久化、不含断线重试**
 *    (CLI 无持久化;跨进程恢复由 langgraph checkpoint 后端承担,见 docs/interrupt-protocol.md)。
 *  - 纯类型 + zod schema,各中断源/交互层可 `import type` 或运行时复用 schema。
 */
import { z } from 'zod'

/** 通用选项(CLI select/multiSelect 与 langgraph approval 共用形状) */
export interface SelectOption {
  label: string
  value: string
  description?: string
}

export const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
})

/**
 * 中断请求 —— 中断源产出的"需要外部(用户)输入"的描述。
 * 中性联合:覆盖 CLI 的 5 种交互 + langgraph 现有 approval。
 * 新增中断源时:若交互形态可归入现有分支则复用,否则在此扩一个分支。
 */
export type InterruptRequest
  = | { interruptId: string, type: 'input', message: string, placeholder?: string }
    | { interruptId: string, type: 'select', message: string, options: SelectOption[] }
    | { interruptId: string, type: 'multiSelect', message: string, options: SelectOption[] }
    | { interruptId: string, type: 'modal', title: string, body: string, actions: string[] }
    | { interruptId: string, type: 'approval', message: string, details: string }
    | { interruptId: string, type: 'unlock', message: string, key: string }

/** 中断请求的交互形态(去掉 interruptId 后的判别字段) */
export type InterruptKind = InterruptRequest['type']

/**
 * 中断响应 —— 外部对某中断请求的回复。`interruptId` 必填,用于路由回正确中断点。
 * payload 形状由对应 request.type 决定(见 toResponse 帮助类型)。
 */
export interface InterruptResponse {
  interruptId: string
  type: InterruptKind
  payload: unknown
}

/** 各 type 对应的 payload 形状(映射函数用) */
export interface InterruptPayloadByKind {
  input: { value: string }
  select: { value: string }
  multiSelect: { values: string[] }
  modal: { action: string }
  approval: { approved: boolean, reason?: string }
  unlock: Record<string, never>
}

/** 构造一个类型安全的 InterruptResponse */
export function toResponse<K extends InterruptKind>(
  interruptId: string,
  type: K,
  payload: InterruptPayloadByKind[K],
): InterruptResponse {
  return { interruptId, type, payload }
}

/** 中断源标识(为未来 hooks 事件中断等多源场景预留;本期 CLI/langgraph 不强制填写) */
export type InterruptSource = 'cli' | 'langgraph' | 'hooks'

// ==========================================
// 审批决策（approval 类型中断的响应 payload，跨层共用）
// ==========================================

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

export const ApprovalDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
})

// ==========================================
// PendingInterrupt —— checkpoint 持久化的挂起中断
// ==========================================

/**
 * langgraph checkpoint 中挂起的 HITL 中断（由 `getState` hydrate，非 DB 投影）。
 * 与 `InterruptRequest` 同构(interruptId + type + 各 type 字段)，type 覆盖全部 6 种交互。
 * interruptId 来自 langgraph task（`task.interrupts[].id`），CLI 侧来自 randomUUID()。
 */
export const PendingInterruptSchema = z.discriminatedUnion('type', [
  z.object({ interruptId: z.string(), type: z.literal('input'), message: z.string(), placeholder: z.string().optional() }),
  z.object({ interruptId: z.string(), type: z.literal('select'), message: z.string(), options: z.array(SelectOptionSchema) }),
  z.object({ interruptId: z.string(), type: z.literal('multiSelect'), message: z.string(), options: z.array(SelectOptionSchema) }),
  z.object({ interruptId: z.string(), type: z.literal('modal'), title: z.string(), body: z.string(), actions: z.array(z.string()) }),
  z.object({ interruptId: z.string(), type: z.literal('approval'), message: z.string(), details: z.string() }),
  z.object({ interruptId: z.string(), type: z.literal('unlock'), message: z.string(), key: z.string() }),
])
export type PendingInterrupt = z.infer<typeof PendingInterruptSchema>

/** 图执行态：checkpoints.sqlite 为唯一真相源 */
export interface ThreadState {
  pendingInterrupt: PendingInterrupt | null
}

export {
  KB_CITATIONS_EVENT,
  type KbCitation,
  KbCitationSchema,
  type KbCitationsPayload,
  KbCitationsPayloadSchema,
} from './kb'
export {
  computeHunks,
  type Hunk,
  hunkKey,
  WRITER_CHANGE_SUMMARIES_EVENT,
  WriterChangeSummariesSchema,
  type WriterChangeSummary,
  WriterChangeSummarySchema,
  WriterHunkSummariesSchema,
} from './writer'
