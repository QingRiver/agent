import type { StructuredToolInterface } from '@langchain/core/tools'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'

/**
 * 可延迟装载工具列表的 ToolNode，本身作为图节点挂载（禁止外层再 `.invoke`）。
 *
 * 背景：在普通节点里 `await new ToolNode(tools).invoke(...)` 会使 LangGraph
 * 对同一 toolCallId 双发 `tool-started`，AG-UI verify 拒绝第二次 TOOL_CALL_START。
 * 正确做法是 `.addNode('tools', toolNode)`；工具需异步就绪时用本类。
 */
export class LazyToolNode extends ToolNode {
  readonly #loadTools: () => Promise<StructuredToolInterface[]>
  #ready: Promise<void> | null = null

  constructor(loadTools: () => Promise<StructuredToolInterface[]>) {
    super([])
    this.#loadTools = loadTools
  }

  protected override async run(
    input: unknown,
    config: LangGraphRunnableConfig,
  ): Promise<unknown> {
    this.#ready ??= this.#loadTools().then((tools) => {
      this.tools = tools
    })
    await this.#ready
    return super.run(input, config)
  }
}
