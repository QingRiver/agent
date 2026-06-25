/**
 * CLI 中断 ↔ 中性协议映射
 *
 * CLI 的 `InteractionRequest/Response` 与中性协议 `InterruptRequest/Response`
 * 形状同构,差异仅在:CLI 请求不带 interruptId(id 在 hook 挂起时生成,见 use-conversation)。
 * 此模块把两侧互转,使 CLI 中断可作为中性协议的一等公民被消费
 * (未来 CLI 直连 server / 接入 hooks 事件中断时复用)。
 *
 * 本期仅做过程对齐,不做持久化(见 docs/interrupt-protocol.md)。
 */
import type {
  InterruptRequest,
  InterruptResponse,
} from '@agent/protocol'
import type { InteractionRequest, InteractionResponse } from '@core/types'

/** CLI 请求 → 中性请求(补 interruptId) */
export function interactionRequestToInterrupt(
  request: InteractionRequest,
  interruptId: string,
): InterruptRequest {
  return { interruptId, ...request } as InterruptRequest
}

/** 中性请求 → CLI 请求(剥离 interruptId) */
export function interruptToInteractionRequest(
  interrupt: InterruptRequest,
): InteractionRequest {
  const { interruptId: _interruptId, ...rest } = interrupt
  return rest as InteractionRequest
}

/** CLI 响应 → 中性响应(type 在 CLI 侧是宽 string,此处收窄为字面量联合) */
export function interactionResponseToInterrupt(
  response: InteractionResponse,
): InterruptResponse {
  return response as InterruptResponse
}

/** 中性响应 → CLI 响应 */
export function interruptToInteractionResponse(
  interrupt: InterruptResponse,
): InteractionResponse {
  return interrupt
}
