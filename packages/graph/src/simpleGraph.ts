import { Annotation, StateGraph } from '@langchain/langgraph'
import { sleep } from 'radash'

const GraphState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

async function nodeA() {
  await sleep(1000)
  return { messages: ['来自节点 A 的响应'] }
}

async function nodeB() {
  await sleep(1000)
  return { messages: ['来自节点 B 的流程结束'] }
}

export const simpleGraph = new StateGraph(GraphState)
  .addNode('node_a', nodeA)
  .addNode('node_b', nodeB)
  .addEdge('__start__', 'node_a')
  .addEdge('node_a', 'node_b')
  .addEdge('node_b', '__end__')
