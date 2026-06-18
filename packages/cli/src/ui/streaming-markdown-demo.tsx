/* eslint-disable react-refresh/only-export-components -- 演示入口文件，无导出 */
/**
 * streaming-markdown MVP 演示
 * 运行：pnpm --filter @agent/cli exec tsx src/ui/streaming-markdown-demo.tsx
 *
 * 模拟 LLM 逐 token 吐字，验证：已完成行不闪烁、最后一行流畅更新、
 * 完成后冻结进 scrollback。
 */

import type { FinishedMessage } from './streaming-markdown'
import { render } from 'ink'
import React, { useEffect, useRef, useState } from 'react'
import { StreamingConversation } from './streaming-markdown'
import { useStreamingBuffer } from './use-streaming-buffer'

const SAMPLE = `正在分析 \`streaming-markdown.tsx\`……

## 核心结论
- **已完成行**只解析一次，永不重渲染
- *进行中行*每 token 重绘，但仅此一行
- 全部完成后冻结进终端 *scrollback*
- 嵌套列表演示：
  - 二级缩进项 A
  - 二级缩进项 B

### 有序列表
1. 第一步：\`append(chunk)\` 写入 ref
2. 第二步：微任务合批 flush
3. 第三步：\`commit()\` 冻结进 scrollback

## 代码块
\`\`\`ts
// 稳定前缀边界：stablePrefix 永不重解析
const stable = stablePrefixRef.current
const suffix = stripped.substring(stable.length)
\`\`\`

## 表格
| 机制 | 来源 | 作用 |
|------|------|------|
| useDeferredValue | repl.tsx:1318 | 延迟快照不阻塞 |
| 稳定前缀边界 | Markdown.tsx | 已完成块不重解析 |
| <Static> | dumpMode | 完成即冻结 |

> 这是一段引用：未闭合语法只影响最后一个 block。

代码示例：\`useDeferredValue(buffer)\` 即可消除阻塞。`

function Demo() {
  const { buffer, append, commit } = useStreamingBuffer()
  const [finished, setFinished] = useState<FinishedMessage[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    // 按字符流式喂入，制造高频更新
    const chars = [...SAMPLE]
    let i = 0
    const timer = setInterval(() => {
      if (i >= chars.length) {
        clearInterval(timer)
        // 流结束：取出完整内容冻结进 Static
        const content = commit()
        setFinished(prev => [...prev, { id: idRef.current++, content }])
        return
      }
      append(chars[i++]!)
    }, 16) // ~60 token/s
    return () => clearInterval(timer)
  }, [append, commit])

  return <StreamingConversation finished={finished} streaming={buffer} />
}

render(React.createElement(Demo))
