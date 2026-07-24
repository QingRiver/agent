import { StateGraph } from '@langchain/langgraph'
import { afterKbGenerate } from '../edges/afterKbGenerate'
import { afterKbRetrieve } from '../edges/afterKbRetrieve'
import { kbGenerateNode } from '../nodes/kb/generate'
import { kbRetrieveNode } from '../nodes/kb/retrieve'
import { kbRewriteNode } from '../nodes/kb/rewrite'
import { KbState } from '../state/kbState'

export { KB_CITATIONS_EVENT } from '@agent/protocol'

export const kbGraph = new StateGraph(KbState)
  .addNode('rewrite', kbRewriteNode)
  .addNode('retrieve', kbRetrieveNode)
  .addNode('generate', kbGenerateNode)
  .addEdge('__start__', 'rewrite')
  .addEdge('rewrite', 'retrieve')
  .addConditionalEdges('retrieve', afterKbRetrieve)
  .addConditionalEdges('generate', afterKbGenerate)
