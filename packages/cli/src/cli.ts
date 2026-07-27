import process from 'node:process'
import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/protocol'
import { interactTools } from '@cli/agent/interact-tools'
import { createTushareAgent } from '@cli/agent/tushare'
import { OpenAIDriver } from '@core/driver/openai'
import { createTushareMcp } from '@core/mcp/client'
import { boot } from './boot'

// ==========================================
// 入口
// ==========================================

async function main() {
  let mcp: Awaited<ReturnType<typeof createTushareMcp>> | null = null

  const shutdown = async () => {
    if (mcp) {
      await mcp.close().catch(() => undefined)
      mcp = null
    }
  }

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0))
  })

  try {
    mcp = await createTushareMcp()
    const { tools, systemPrompt } = createTushareAgent(mcp)

    boot(
      new OpenAIDriver(),
      [...tools, ...interactTools],
      [systemPrompt, ASK_TOOLS_SYSTEM_PROMPT].join('\n\n'),
    )
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`启动失败: ${message}`)
    await shutdown()
    process.exit(1)
  }
}

void main()
