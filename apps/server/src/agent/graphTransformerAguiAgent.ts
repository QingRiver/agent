import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { Observable } from 'rxjs'
import { AbstractAgent } from '@ag-ui/client'
import { defer, from } from 'rxjs'

export class GraphTransformerAguiAgent extends AbstractAgent {
  readonly #config: { agentId: string, description: string }
  readonly #eventStream: (input: RunAgentInput) => AsyncGenerator<BaseEvent>

  constructor(
    config: { agentId: string, description: string },
    eventStream: (input: RunAgentInput) => AsyncGenerator<BaseEvent>,
  ) {
    super({ agentId: config.agentId, description: config.description })
    this.#config = config
    this.#eventStream = eventStream
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(() => from(this.#eventStream(input)))
  }

  clone(): GraphTransformerAguiAgent {
    const cloned = new GraphTransformerAguiAgent(this.#config, this.#eventStream)
    cloned.threadId = this.threadId
    cloned.messages = structuredClone(this.messages)
    cloned.state = structuredClone(this.state)
    cloned.debug = this.debug
    return cloned
  }
}
