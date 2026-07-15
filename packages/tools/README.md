# @agent/tools

可复用外部工具：Open-Meteo 天气、Tushare（直连 + MCP）、prompt 模板。供 `@agent/graph` 与 `@agent/cli` 共用。

## 导出概览

| 导出 | 说明 |
|------|------|
| `openMeteo` | Open-Meteo 天气查询 |
| `tushare` / `DailyRow` 等 | Tushare HTTP 直连与行类型 |
| `createTushareMcp` / `TushareMcp` | Tushare MCP 客户端 |
| `queryStockBasic` / `parseStockCandidates` | 股票代码解析 |
| `renderPrompt` / `createSchemaFromPrompt` | Prompt 模板与变量抽取 |
| `renderTushareSystemPrompt` | Tushare Agent 系统提示 |

## 目录

```text
src/
├── openMeteo.ts
├── tushare.ts
├── promptTemplate.ts
└── mcp/
    ├── tushareClient.ts
    ├── tusharePrompt.ts
    ├── stockResolve.ts
    └── prompts/tushare.md
```

## 使用

```ts
import { openMeteo, createTushareMcp, renderTushareSystemPrompt } from '@agent/tools'
```

- `weatherGraph` / CLI weather → `openMeteo`
- `tushareGraph` / CLI tushare → MCP + stock resolve
- 运行时可选 `TUSHARE_TOKEN`（见根 `.env.example`）

## 常用命令

```bash
pnpm --filter @agent/tools tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [wiki/ReAct.md](../../wiki/ReAct.md) — weather + tushare
- [wiki/CLI-交互实现.md](../../wiki/CLI-交互实现.md)
- [packages/graph/README.md](../graph/README.md)
