import { END, START, StateGraph } from '@langchain/langgraph'
import { makeWriteEditNode } from '../nodes/writeEdit'
import { WriterState } from '../state/writerState'

export { WRITER_CHANGE_SUMMARIES_EVENT, type WriterChangeSummary } from '@agent/protocol'

export const writerGraph = new StateGraph(WriterState)
  .addNode('writeEdit', makeWriteEditNode())
  .addEdge(START, 'writeEdit')
  .addEdge('writeEdit', END)
