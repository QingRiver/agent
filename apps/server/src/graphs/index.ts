import { hitlGraph, simpleGraph, weatherGraph } from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { devMemoryCheckpointer } from './memoryCheckpointer'

export function buildWeatherInput(userText: string) {
  return { messages: [new HumanMessage(userText)] }
}

export const hitlGraphApp = hitlGraph.compile({ checkpointer: devMemoryCheckpointer })
export const simpleGraphApp = simpleGraph.compile({ checkpointer: devMemoryCheckpointer })
export const weatherGraphApp = weatherGraph.compile({ checkpointer: devMemoryCheckpointer })
