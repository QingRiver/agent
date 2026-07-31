import type { BaseEvent } from '@ag-ui/core'
import type { Options } from '../sdk'
import { query } from '../sdk'
import { mapSdkMessageToAgUi } from './mapSdkToAgUi'
import { createClaudeAguiMapState } from './types'

export interface StreamClaudeSdkToAgUiParams {
  prompt: string
  options?: Options | undefined
}

/** Claude SDK query 流 → AG-UI 事件（不含 RUN_STARTED / RUN_FINISHED） */
export async function* streamClaudeSdkToAgUi(
  params: StreamClaudeSdkToAgUiParams,
): AsyncGenerator<BaseEvent> {
  const { prompt, options } = params
  const mergedOptions: Options = {
    includePartialMessages: true,
    ...options,
  }
  const stream = query({ prompt, options: mergedOptions })
  const state = createClaudeAguiMapState()

  for await (const message of stream) {
    for (const event of mapSdkMessageToAgUi(message, state))
      yield event
  }
}
