import { START, StateGraph } from '@langchain/langgraph'
import { KB_GENERATE_ENDS, kbGenerateNode } from '../nodes/kb/generate'
import { KB_RETRIEVE_ENDS, kbRetrieveNode } from '../nodes/kb/retrieve'
import { kbRewriteNode } from '../nodes/kb/rewrite'
import { KbState } from '../state/kbState'

export const kbGraph = new StateGraph(KbState)
  .addNode('rewrite', kbRewriteNode)
  .addNode('retrieve', kbRetrieveNode, { ends: [...KB_RETRIEVE_ENDS] })
  .addNode('generate', kbGenerateNode, { ends: [...KB_GENERATE_ENDS] })
  .addEdge(START, 'rewrite')
  .addEdge('rewrite', 'retrieve')
