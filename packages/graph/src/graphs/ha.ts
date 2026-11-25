import { readSkillBody } from '@agent/skills/node'
import { getHaToolset } from '../tools/ha/toolset'
import { createToolLoopGraph } from './createToolLoopGraph'

export { buildHaToolset } from '../tools/ha/toolset'

/** system prompt 取自 skill body（单一源）：home-assistant + clarify_ask 纪律。 */
export const haGraph = createToolLoopGraph({
  tools: async () => (await getHaToolset()).tools,
  system: `${readSkillBody('home-assistant')}\n\n${readSkillBody('clarify-ask')}`,
})
