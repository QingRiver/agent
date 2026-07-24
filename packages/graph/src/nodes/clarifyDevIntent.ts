import type { DevIntent, DevStateType } from '../state/devState'
import { AIMessage } from '@langchain/core/messages'
import { hitlSelect } from '../tools/hitl/interrupt'

const CLARIFY_MESSAGE = '请选择本次要演示的能力：'

const CLARIFY_OPTIONS = [
  { label: '天气查询', value: 'weather', description: 'Open-Meteo + ask_* 工具' },
  { label: '简单工具调用', value: 'simpleTool', description: '模拟取消订单工具' },
  { label: 'HITL 审批演示', value: 'hitlDemo', description: 'input→select→multiSelect→approval' },
] as const

const FALLBACK_WEATHER_MESSAGE = '没有匹配的工具,我们来看看天气怎么样吧'

/** 首轮澄清：select 三选项，写入 devIntent（不走 LLM） */
export async function clarifyDevIntent(
  state: DevStateType,
): Promise<{ devIntent: DevIntent, messages?: AIMessage[] }> {
  if (state.devIntent === 'weather' || state.devIntent === 'simpleTool' || state.devIntent === 'hitlDemo')
    return { devIntent: state.devIntent }

  const resp = await hitlSelect({
    message: CLARIFY_MESSAGE,
    options: CLARIFY_OPTIONS.map(o => ({
      label: o.label,
      value: o.value,
      description: o.description,
    })),
  })

  const value = resp.value
  if (value === 'weather' || value === 'simpleTool' || value === 'hitlDemo')
    return { devIntent: value }

  return {
    devIntent: 'weather',
    messages: [new AIMessage(FALLBACK_WEATHER_MESSAGE)],
  }
}
