import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { Observable } from 'rxjs'
import { AbstractAgent } from '@ag-ui/client'
import { defer, from } from 'rxjs'

export class GraphTransformerAguiAgent extends AbstractAgent {
  /**
   * 不可用 `#` 私有字段：基类 `clone()` 是 `Object.create(proto)`，
   * 不会跑子类构造，写入 `#field` 会抛
   * “Cannot write private member … whose class did not declare it”。
   * TS `private` 编译为普通属性，与 AbstractAgent.clone 兼容。
   */
  private config: { agentId: string, description: string }
  private eventStream: (input: RunAgentInput) => AsyncGenerator<BaseEvent>

  constructor(
    config: { agentId: string, description: string },
    eventStream: (input: RunAgentInput) => AsyncGenerator<BaseEvent>,
  ) {
    super({ agentId: config.agentId, description: config.description })
    this.config = config
    this.eventStream = eventStream
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return defer(() => from(this.eventStream(input)))
  }

  /**
   * CopilotKit 每 run 会 clone；须保留 middlewares（基类 clone 已拷贝）
   * 以及本类的 eventStream / config。
   */
  clone(): GraphTransformerAguiAgent {
    const cloned = super.clone() as GraphTransformerAguiAgent
    cloned.config = this.config
    cloned.eventStream = this.eventStream
    return cloned
  }
}
