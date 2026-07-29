# @agent/protocol

跨层**中性契约**：HITL 中断/恢复、Writer hunk/summary。不绑定 LangGraph、Copilot 或 CLI 实现。

## 导出概览

| 领域 | 典型导出 |
|------|----------|
| HITL | `InterruptRequest` / `InterruptResponse`、`PendingInterrupt`、`ThreadState`、`toResponse` |
| Writer | `WRITER_CHANGE_SUMMARIES_EVENT`、`computeHunks`、`Hunk`、`WriterChangeSummary*` |

> KB 引文已改为答案内 Markdown 链接（如 `[n](/kb?path=…&chunk=…)`）；不再在本包导出 `KbCitation*` / 自定义事件。

## 设计要点

- `interruptId` 是恢复路由的唯一依据；多源/并发中断靠 id 匹配。
- 纯类型 + zod schema；各中断源（LangGraph `interrupt`、CLI Effect）各自薄映射到此处。

## 使用

```ts
import type { InterruptRequest, PendingInterrupt } from '@agent/protocol'
import { computeHunks } from '@agent/protocol'
```

- **Client**：HITL 审批卡、文本编辑器 session（避免直接依赖 `@agent/graph`）
- **Server shared / Graph / CLI**：会话 `threadState`、interrupt 映射

## 常用命令

```bash
pnpm --filter @agent/protocol tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [wiki/LangGraph-AGUI-人在回路.md](../../wiki/LangGraph-AGUI-人在回路.md)
- [wiki/CLI-交互实现.md](../../wiki/CLI-交互实现.md)
- [wiki/文本编辑器.md](../../wiki/文本编辑器.md)
