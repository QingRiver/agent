import type { DevRouteTarget, DevStateType } from '../state/devState'
import { AIMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import {
  DEV_CLARIFY_OPTIONS,
  DEV_INTENT_ROUTE,
  DevIntent,

  isDevIntent,
} from '../state/devState'
import { hitlSelect } from '../tools/hitl/interrupt'

const CLARIFY_MESSAGE = '请选择本次要演示的能力：'
const FALLBACK_WEATHER_MESSAGE = '没有匹配的工具,我们来看看天气怎么样吧'

function route(intent: DevIntent): Command<
  unknown,
  { devIntent: DevIntent, messages?: AIMessage[] },
  DevRouteTarget
> {
  return new Command({
    update: { devIntent: intent },
    goto: DEV_INTENT_ROUTE[intent],
  })
}

/** 首轮澄清：select 写入 devIntent，并用 Command 分流（不走 LLM） */
export async function clarifyDevIntent(state: DevStateType) {
  if (isDevIntent(state.devIntent))
    return route(state.devIntent)

  const resp = await hitlSelect({
    message: CLARIFY_MESSAGE,
    options: DEV_CLARIFY_OPTIONS.map(o => ({
      label: o.label,
      value: o.intent,
      description: o.description,
    })),
  })

  if (isDevIntent(resp.value))
    return route(resp.value)

  return new Command({
    update: {
      devIntent: DevIntent.weather,
      messages: [new AIMessage(FALLBACK_WEATHER_MESSAGE)],
    },
    goto: DEV_INTENT_ROUTE[DevIntent.weather],
  })
}
