import type {
  ToolCallArgsEvent,
  ToolCallChunkEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from '@ag-ui/core'
import type { ToolsEventData } from '@langchain/langgraph'
import { EventType } from '@ag-ui/core'

/** AG-UI 工具调用相关事件（`TOOL_CALL_*`） */
export type AguiToolEvent
  = | ToolCallStartEvent
    | ToolCallArgsEvent
    | ToolCallEndEvent
    | ToolCallResultEvent
    | ToolCallChunkEvent

/** `ToolsEventData` → AG-UI 工具事件序列 */
export function mapToolsEventDataToAgUi(data: ToolsEventData): AguiToolEvent[] {
  switch (data.event) {
    case 'tool-started':
      return [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: data.tool_call_id,
          toolCallName: data.tool_name,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: data.tool_call_id,
          delta: typeof data.input === 'string' ? data.input : JSON.stringify(data.input),
        },
      ]
    case 'tool-finished':
      return [
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: data.tool_call_id,
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: crypto.randomUUID(),
          toolCallId: data.tool_call_id,
          content: typeof data.output === 'string' ? data.output : JSON.stringify(data.output),
          role: 'tool',
        },
      ]
    case 'tool-output-delta':
      return [{
        type: EventType.TOOL_CALL_CHUNK,
        toolCallId: data.tool_call_id,
        delta: data.delta,
      }]
    case 'tool-error':
      return [
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: data.tool_call_id,
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: crypto.randomUUID(),
          toolCallId: data.tool_call_id,
          content: data.message,
          role: 'tool',
          error: data.message,
        },
      ]
  }
}
