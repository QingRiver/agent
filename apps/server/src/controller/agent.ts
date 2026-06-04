import type { RunAgentInput } from '@ag-ui/core'
import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { getAgent } from '../agent'
import { Controller, Post } from '../router/decorator'
import { respondWithAguiObservableStream } from '../utils/aguiSse'

@Controller('/api/agent')
export class AgentController {
  @Post('/:agentId/run')
  async run(c: Context<AppEnv>): Promise<Response> {
    const agentId = c.req.param('agentId') ?? ''
    if (!agentId)
      return c.json({ error: 'Missing agentId' }, 400)

    let agent
    try {
      agent = getAgent(agentId)
    }
    catch {
      return c.json({ error: `Unknown agent: ${agentId}` }, 404)
    }

    const body = await c.req.json() as RunAgentInput
    if (!body.threadId || !body.runId)
      return c.json({ error: 'Missing threadId or runId' }, 400)

    return respondWithAguiObservableStream(c, agent.clone().run(body))
  }
}
