import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { WriteEditInput } from './editorWriteEdit'
import { Annotation, StateGraph } from '@langchain/langgraph'
import {
  messageText,
  readFocuses,
  readOptionalString,
  resolveEditCase,
  runWriteEdit,
} from './editorWriteEdit'

export { WRITER_CHANGE_SUMMARIES_EVENT, type WriterChangeSummary } from '@agent/protocol'

const WriterState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

async function writer(
  state: typeof WriterState.State,
  config: LangGraphRunnableConfig,
) {
  const editCase = resolveEditCase(config)
  const latestUser = [...state.messages].reverse().find(m => m.getType() === 'human')
  const humanContent = messageText(latestUser)
  const focuses = readFocuses(config)
  const instruction = readOptionalString(config, 'polishInstruction')
  const baseline = readOptionalString(config, 'documentBaseline') || (editCase === 'document' ? humanContent : '')

  const input: WriteEditInput = { editCase }
  if (baseline)
    input.documentBaseline = baseline
  if (instruction)
    input.polishInstruction = instruction
  if (focuses.length)
    input.focuses = focuses
  if (editCase === 'inline' && humanContent)
    input.humanContent = humanContent

  const { messages } = await runWriteEdit(input, config)

  return { messages }
}

export const writerGraph = new StateGraph(WriterState)
  .addNode('writer', writer)
  .addEdge('__start__', 'writer')
  .addEdge('writer', '__end__')
