import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { Options } from '@agent/claude-agent'
import { EventType } from '@ag-ui/core'
import { streamClaudeSdkToAgUi } from '@agent/claude-agent'
import { getRequestContext } from '../context/requestContext'
import { ConversationService } from '../service/conversation'

export async function* streamClaudeAgentAguiEvents(
  input: RunAgentInput,
  options: {
    prompt: string
    sdkOptions?: Options
  },
): AsyncGenerator<BaseEvent> {
  const { threadId, runId } = input

  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    input,
  }

  try {
    for await (const event of streamClaudeSdkToAgUi({
      prompt: options.prompt,
      options: options.sdkOptions,
    }))
      yield event

    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: { type: 'success' },
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    yield {
      type: EventType.RUN_ERROR,
      message,
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
    }
  }
  finally {
    const ctx = getRequestContext()
    if (ctx.mode === 'auth' && ctx.userId)
      ConversationService.touch(ctx.userId, input.threadId)
  }
}
