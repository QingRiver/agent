import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { CompiledStateGraph } from '@langchain/langgraph'
import type { GraphAguiStreamOptions } from './runGraphAsAguiStream'
import { AbstractAgent } from '@ag-ui/client'
import { Observable } from 'rxjs'
import { pickGraphAguiStreamOptions, runGraphAsAguiStream } from './runGraphAsAguiStream'

export interface LangGraphAguiAgentConfig extends GraphAguiStreamOptions {
  agentId: string
  description: string
  graph: CompiledStateGraph<any, any, any>
}

export class LangGraphAguiAgent extends AbstractAgent {
  private readonly graph: CompiledStateGraph<any, any, any>
  private readonly streamOptions: GraphAguiStreamOptions
  private readonly configOptions: LangGraphAguiAgentConfig

  constructor(config: LangGraphAguiAgentConfig) {
    super({ agentId: config.agentId, description: config.description })
    this.graph = config.graph
    this.streamOptions = pickGraphAguiStreamOptions(config)
    this.configOptions = config
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      return runGraphAsAguiStream(this.graph, input, subscriber, this.streamOptions)
    })
  }

  clone(): LangGraphAguiAgent {
    const cloned = new LangGraphAguiAgent(this.configOptions)
    cloned.threadId = this.threadId
    cloned.messages = structuredClone(this.messages)
    cloned.state = structuredClone(this.state)
    cloned.debug = this.debug
    return cloned
  }
}
