import type { BaseMessage } from '@langchain/core/messages'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { llmLog } from './utils'

const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

async function nodeA() {
  const response = await llmLog('来自节点 A 的响应')
  return { messages: [response] }
}

async function nodeB() {
  const response = await llmLog('来自节点 B 的流程结束')
  return { messages: [response] }
}

export const simpleGraph = new StateGraph(GraphState)
  .addNode('node_a', nodeA)
  .addNode('node_b', nodeB)
  .addEdge('__start__', 'node_a')
  .addEdge('node_a', 'node_b')
  .addEdge('node_b', '__end__')
