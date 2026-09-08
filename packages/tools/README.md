# @agent/tools

可复用外部工具：Open-Meteo 天气、Tushare（直连 + MCP）、Home Assistant MCP、prompt 模板。供 `@agent/graph` 与 `@agent/cli` 共用。

## 导出概览

| 导出 | 说明 |
|------|------|
| `openMeteo` | Open-Meteo 天气查询 |
| `tushare` / `DailyRow` 等 | Tushare HTTP 直连与行类型 |
| `createTushareMcp` / `TushareMcp` | Tushare MCP 客户端 |
| `createHaMcp` / `HaMcp` | Home Assistant 官方 MCP Server 客户端（`/api/mcp`） |
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
    ├── haClient.ts
    ├── tushareClient.ts
    ├── tusharePrompt.ts
    ├── stockResolve.ts
    └── prompts/tushare.md
```

## 使用

```ts
import { openMeteo, createTushareMcp, createHaMcp, renderTushareSystemPrompt } from '@agent/tools'
```

- `weatherGraph` / CLI weather → `openMeteo`
- `tushareGraph` / CLI tushare → MCP + stock resolve
- `haGraph` → Home Assistant MCP（需启用官方 [mcp_server](https://www.home-assistant.io/integrations/mcp_server/)）
- 运行时可选 `TUSHARE_TOKEN`、`HA_URL` / `HA_TOKEN`（见根 `.env.example`）

## 常用命令

```bash
pnpm --filter @agent/tools tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [packages/graph/README.md](../graph/README.md)
