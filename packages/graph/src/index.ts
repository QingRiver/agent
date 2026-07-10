import { z } from 'zod'
import { claudeAgentGraph } from './claudeAgentGraph'
import { hitlGraph } from './hitlGraph'
import { kbGraph } from './kbGraph'
import { obsidianGraph } from './obsidianGraph'
import { simpleGraph } from './simpleGraph'
import { simpleToolCallGraph } from './simpleToolCallGraph'
import { tushareGraph } from './tushareGraph'
import { weatherGraph } from './weatherGraph'
import { writerGraph } from './writerGraph'

export { ASK_SYSTEM_PROMPT, ASK_TOOLS } from './hitl/ask-tools'
export {
  KB_CITATIONS_EVENT,
  kbGraph,
} from './kbGraph'
export {
  MAX_SEARCH_RESULTS,
  OBSIDIAN_SEARCH_TOOL_NAME,
} from './obsidianGraph'
export {
  FETCH_USER_ORDER_TOOL_NAME,
  ORDER_TOOL_PROGRESS_EVENT,
} from './simpleToolCallGraph'

export const Graphs = {
  claudeAgent: claudeAgentGraph,
  simple: simpleGraph,
  simpleToolCall: simpleToolCallGraph,
  weather: weatherGraph,
  obsidian: obsidianGraph,
  hitl: hitlGraph,
  kb: kbGraph,
  tushare: tushareGraph,
  writer: writerGraph,
} as const

export type GraphsName = keyof typeof Graphs

const graphsNameValues = Object.keys(Graphs) as GraphsName[]

export const GraphsNameSchema = z.enum(
  graphsNameValues as [GraphsName, ...GraphsName[]],
)

export {
  type AguiExtensions,
  type AguiFinalizeContext,
  type AguiMappedEvent,
  aguiRunContext,
  type AguiTextMessageEvent,
  type AguiToolEvent,
  AguiTransformer,
  aguiTransformerFactory,
  buildInterruptFinalizeEvents,
  INTERRUPT_REASON_CONFIRMATION,
  mapInterruptPayloadsToAgUi,
  mapInterruptPayloadToAgUi,
  mapMessagesEventDataToAgUi,
  mapToolsEventDataToAgUi,
  resolveResumeFromRunAgentInput,
} from './stream/index'
export {
  WRITER_CHANGE_SUMMARIES_EVENT,
  type WriterChangeSummary,
  writerGraph,
} from './writerGraph'
