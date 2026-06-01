import { Annotation, StateGraph } from '@langchain/langgraph'
import { sleep } from 'radash'

// 1. 定义状态
const GraphState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

// 2. 定义节点
async function nodeA() {
  await sleep(1000)
  return { messages: ['来自节点 A 的响应'] }
}

async function nodeB() {
  await sleep(1000)
  return { messages: ['来自节点 B 的流程结束'] }
}

// 3. 构建并编译图
const workflow = new StateGraph(GraphState)
  .addNode('node_a', nodeA)
  .addNode('node_b', nodeB)
  .addEdge('__start__', 'node_a')
  .addEdge('node_a', 'node_b')
  .addEdge('node_b', '__end__')

// 【核心】只编译一次，导出这个已经编译好的 app 实例
export const simpleGraphApp = workflow.compile()
