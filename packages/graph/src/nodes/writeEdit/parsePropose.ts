import type { AIMessage as AIMessageType } from '@langchain/core/messages'
import {
  DocumentEditPatchSchema,
  PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
  ProposeDocumentEditsArgsSchema,
} from '@agent/proto'
import { AIMessage } from '@langchain/core/messages'
import { z } from 'zod'

export function parseProposeEditsArgs(
  response: AIMessageType,
): z.infer<typeof ProposeDocumentEditsArgsSchema> | null {
  const call = response.tool_calls?.find(c => c.name === PROPOSE_DOCUMENT_EDITS_TOOL_NAME)
  if (!call)
    return null
  const parsed = ProposeDocumentEditsArgsSchema.safeParse(call.args)
  if (parsed.success)
    return parsed.data
  // 部分模型把 edits 摊在顶层
  const loose = z.object({ edits: z.array(DocumentEditPatchSchema).min(1) }).safeParse(call.args)
  return loose.success ? loose.data : null
}

/** 保留 tool_calls 与思考元数据，正文换成短说明。 */
export function keepAiWithNote(response: AIMessageType, note: string): AIMessage {
  return new AIMessage({
    content: note,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
    ...(response.id != null ? { id: response.id } : {}),
    ...(response.tool_calls?.length
      ? { tool_calls: response.tool_calls.map(call => ({ ...call })) }
      : {}),
    ...(response.invalid_tool_calls?.length
      ? { invalid_tool_calls: response.invalid_tool_calls.map(call => ({ ...call })) }
      : {}),
  })
}
