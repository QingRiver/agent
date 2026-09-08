import type { HaMcp } from '@agent/tools'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'
import { buildHaToolset, haGraph } from './ha'

function mockHaMcp(): HaMcp {
  return {
    tools: [{
      name: 'HassTurnOn',
      description: 'Turn on a device or entity',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    }],
    callTool: async () => 'ok',
    close: async () => {},
  }
}

describe('haGraph', () => {
  it('可编译（懒加载 MCP，不依赖 HA_URL / HA_TOKEN）', () => {
    expect(() => haGraph.compile({ checkpointer: new MemorySaver() })).not.toThrow()
  })

  it('buildHaToolset 将 MCP 工具映射为 LangChain 工具', async () => {
    const toolset = await buildHaToolset(mockHaMcp())
    expect(toolset.tools.some(t => t.name === 'HassTurnOn')).toBe(true)
    const hass = toolset.tools.find(t => t.name === 'HassTurnOn')!
    await expect(hass.invoke({ name: '客厅灯' })).resolves.toBe('ok')
  })
})
