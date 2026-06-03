import { LangGraphAguiAgent } from '../agui/LangGraphAguiAgent'
import { simpleGraphApp } from '../graphs/index'

export const simpleAgent = new LangGraphAguiAgent({
  agentId: 'simple',
  description: '两节点示例图',
  graph: simpleGraphApp,
  resolvePayload: () => ({ messages: [] }),
  emitFinalSummary: true,
  formatSummary: () => 'simpleGraph 流程已完成。',
})
