#!/usr/bin/env tsx
/**
 * 编译 src/graphs 下各 StateGraph，经 getGraph().drawMermaid() 写入子包根目录 GRAPHS.md。
 *
 * 用法: pnpm --filter @agent/graph graphs:md
 */
import { readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { MemorySaver } from '@langchain/langgraph'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')
const graphsDir = join(packageRoot, 'src', 'graphs')
const outPath = join(packageRoot, 'GRAPHS.md')

interface CompilableGraph {
  compile: (opts?: { checkpointer?: MemorySaver }) => {
    getGraph: () => { drawMermaid: () => string }
  }
}

function isCompilableGraph(value: unknown): value is CompilableGraph {
  return typeof value === 'object'
    && value != null
    && 'compile' in value
    && typeof (value as CompilableGraph).compile === 'function'
}

/** 去掉节点标签 HTML、以及 graph 方向声明尾部分号，部分渲染器不兼容。 */
function sanitizeMermaid(source: string): string {
  return source
    .replace(/<p>(.*?)<\/p>/g, '$1')
    .replace(/^graph\s+(TD|LR|TB|BT);/m, 'graph $1')
    .trim()
}

async function loadGraphModules(): Promise<Array<{ file: string, name: string, graph: CompilableGraph }>> {
  const entries = await readdir(graphsDir)
  const files = entries
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort()

  const out: Array<{ file: string, name: string, graph: CompilableGraph }> = []
  for (const file of files) {
    const mod = await import(join(graphsDir, file)) as Record<string, unknown>
    for (const [exportName, value] of Object.entries(mod)) {
      if (!exportName.endsWith('Graph') || !isCompilableGraph(value))
        continue
      out.push({ file, name: exportName, graph: value })
    }
  }
  return out
}

async function main(): Promise<void> {
  const graphs = await loadGraphModules()
  if (graphs.length === 0)
    throw new Error(`未在 ${graphsDir} 发现 *Graph 导出`)

  const lines: string[] = [
    '# Graphs',
    '',
    '> 由 `pnpm --filter @agent/graph graphs:md` 自动生成（`compile().getGraph().drawMermaid()`）。',
    '> 请勿手改；改图后重新跑命令。',
    '',
  ]

  for (const { file, name, graph } of graphs) {
    const app = graph.compile({ checkpointer: new MemorySaver() })
    const mermaid = sanitizeMermaid(app.getGraph().drawMermaid())
    lines.push(
      `## \`${name}\``,
      '',
      `来源：\`src/graphs/${file}\``,
      '',
      '```mermaid',
      mermaid,
      '```',
      '',
    )
    console.log(`ok  ${name}  (${file})`)
  }

  await writeFile(outPath, `${lines.join('\n')}\n`, 'utf8')
  console.log(`wrote ${outPath} (${graphs.length} graphs)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
