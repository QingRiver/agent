import type { ProposeDocumentEditsResult, WriterProposalPayload } from '@agent/proto'
import type { AIMessage as AIMessageType, BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { WriteEditInput } from './types'
import {
  applyDocumentEdits,
  DOCUMENT_ASSISTANT_NOTE,
  PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
  WRITER_CHANGE_SUMMARIES_EVENT,
} from '@agent/proto'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { proposeDocumentEditsTool } from '../../tools/proposeDocumentEdits'
import { createChatModel } from '../../utils/chatModel'
import { keepAiWithNote, parseProposeEditsArgs } from './parsePropose'
import { summarizeHunks } from './summarizeHunks'

/** custom 与 ToolMessage 成功载荷同形；custom 仅作早到 UX，checkpoint 以 tool 为准 */
function emitProposal(config: LangGraphRunnableConfig, proposal: WriterProposalPayload) {
  config.writer?.({
    name: WRITER_CHANGE_SUMMARIES_EVENT,
    payload: proposal,
  })
}

export async function runDocumentEdit(
  input: WriteEditInput,
  config: LangGraphRunnableConfig,
  system: string,
  baseline: string,
): Promise<{ messages: BaseMessage[], polished: string }> {
  // DeepSeek thinking 模式不支持 tool_choice 强制；靠 prompt 约束调用工具。
  const llm = createChatModel({
    temperature: 0.7,
    thinking: input.reasoning === true ? 'enabled' : 'disabled',
  }).bindTools(
    [proposeDocumentEditsTool],
    input.reasoning === true
      ? {}
      : { tool_choice: PROPOSE_DOCUMENT_EDITS_TOOL_NAME },
  )

  const response = await llm.invoke([
    new SystemMessage(system),
    new HumanMessage(baseline),
  ], config) as AIMessageType

  const args = parseProposeEditsArgs(response)
  const toolCallId = response.tool_calls?.find(c => c.name === PROPOSE_DOCUMENT_EDITS_TOOL_NAME)?.id
    ?? response.tool_calls?.[0]?.id
    ?? 'propose_document_edits'

  if (!args) {
    const fail: ProposeDocumentEditsResult = { ok: false, error: '模型未提交有效的修订补丁' }
    return {
      polished: '',
      messages: [
        keepAiWithNote(response, '未能生成有效修订，请换一种说法再试。'),
        new ToolMessage({
          tool_call_id: toolCallId,
          name: PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
          content: JSON.stringify(fail),
        }),
      ],
    }
  }

  const applied = applyDocumentEdits(baseline, args.edits)
  if (!applied.ok) {
    const fail: ProposeDocumentEditsResult = { ok: false, error: applied.error }
    return {
      polished: '',
      messages: [
        keepAiWithNote(response, applied.error),
        new ToolMessage({
          tool_call_id: toolCallId,
          name: PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
          content: JSON.stringify(fail),
        }),
      ],
    }
  }

  const changes = await summarizeHunks(baseline, applied.polished)
  const proposal: WriterProposalPayload = {
    baseline,
    polished: applied.polished,
    changes,
  }
  emitProposal(config, proposal)

  const ok: ProposeDocumentEditsResult = { ok: true, ...proposal }
  return {
    polished: applied.polished,
    messages: [
      keepAiWithNote(response, DOCUMENT_ASSISTANT_NOTE),
      new ToolMessage({
        tool_call_id: toolCallId,
        name: PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
        content: JSON.stringify(ok),
      }),
    ],
  }
}
