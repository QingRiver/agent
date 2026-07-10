import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { AGUI_WRITER_EVENT } from './aguiTransformer'

/** 将非流式节点产出的 assistant 文本推入 AG-UI（经 config.writer → AguiTransformer） */
export function writeAguiAssistantText(
  config: LangGraphRunnableConfig,
  text: string,
): void {
  const trimmed = text.trim()
  const writer = config.writer
  if (!writer || !trimmed)
    return

  const messageId = randomUUID()
  const emit = (payload: unknown) => writer({ name: AGUI_WRITER_EVENT, payload })
  emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' })
  emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: trimmed })
  emit({ type: EventType.TEXT_MESSAGE_END, messageId })
}
