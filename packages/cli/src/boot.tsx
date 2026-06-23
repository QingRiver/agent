import type { LlmDriver } from '@core/driver/types'
import type { ToolDef } from '@core/types'
import { App } from '@ui/App'
import { ConversationConfigProvider } from '@ui/components/provider'
import { render } from 'ink'

// ==========================================
// boot — 启动 CLI
// ==========================================

/**
 * 渲染 ink App,在树顶用 ConversationConfigProvider 注入 driver/tools/systemPrompt
 *
 * - 对话循环由 App 内的 useConversation 驱动(配置从 Context 读,无 prop 透传)
 * - 入口文件 cli.tsx 只做 `boot(new OpenAIDriver(), weatherTools, WEATHER_SYSTEM_PROMPT)`
 */
function boot(driver: LlmDriver, tools: ToolDef[], systemPrompt: string) {
  render(
    <ConversationConfigProvider driver={driver} tools={tools} systemPrompt={systemPrompt}>
      <App />
    </ConversationConfigProvider>,
    {
      incrementalRendering: true,
    },
  )
}

export { boot }
