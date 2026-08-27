import { z } from 'zod'
import { claudeAgentGraph } from './graphs/claudeAgent'
import { devGraph } from './graphs/dev'
import { editorGraph } from './graphs/editor'
import { kbGraph } from './graphs/kb'
import { reactAgentGraph } from './graphs/reactAgent'
import { tushareGraph } from './graphs/tushare'

export { claudeAgentGraph } from './graphs/claudeAgent'
export { devGraph } from './graphs/dev'
export {
  editorGraph,
  type EditorPath,
  WRITER_CHANGE_SUMMARIES_EVENT,
  type WriterChangeSummary,
} from './graphs/editor'
export {
  kbGraph,
} from './graphs/kb'
export {
  AGENT_CONFIG_ID_PROPS_KEY,
  clampMaxSteps,
  composeReactAgentSystemPrompt,
  DEFAULT_REACT_AGENT_USER_PROMPT,
  KB_SEARCH_SYSTEM_PROMPT,
  REACT_AGENT_FORWARDED_PROPS_KEY,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
  reactAgentGraph,
  type ReactAgentRuntimeConfig,
  ReactAgentRuntimeConfigSchema,
  readAgentConfigId,
  readReactAgentForwardedProps,
  sanitizeKbId,
  sanitizeUserPrompt,
} from './graphs/reactAgent'
export { tushareGraph } from './graphs/tushare'
export { type EditorFocus, runWriteEdit, type WriteEditInput } from './nodes/writeEdit'
export {
  type AguiExtensions,
  type AguiMappedEvent,
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
export { ASK_TOOLS } from './tools/ask-tools'
export { KB_SEARCH_TOOL_NAME, KB_TOOLS } from './tools/kb'
export {
  FETCH_USER_ORDER_TOOL_NAME,
  ORDER_TOOL_PROGRESS_EVENT,
} from './tools/order'
export { setSkillFileLoader, type SkillBinding, type SkillFileLoader } from './tools/read-skill-file'

export const Graphs = {
  claudeAgent: claudeAgentGraph,
  reactAgent: reactAgentGraph,
  dev: devGraph,
  kb: kbGraph,
  tushare: tushareGraph,
  editor: editorGraph,
} as const

export type GraphsName = keyof typeof Graphs

const graphsNameValues = Object.keys(Graphs) as GraphsName[]

export const GraphsNameSchema = z.enum(
  graphsNameValues as [GraphsName, ...GraphsName[]],
)
