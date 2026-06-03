---
name: sample
description: >-
  Conventions for @Controller('/sample') routes in apps/server. Use when adding
  or changing sample LangGraph demos.
---

# Sample controller routes

`SampleController` lives at [apps/server/src/controller/sample.ts](apps/server/src/controller/sample.ts).

## Routes

| Method | Path | Mode | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/sample/simpleGraph` | Sync `invoke` | Returns final graph state |
| `GET` | `/sample/simpleGraph/sse` | SSE | `streamMode: 'updates'` |
| `GET` | `/sample/weather` | **SSE only** | Weather ReAct agent; query `message` (default: 北京今天天气怎么样？) |

## Code layout

| Layer | Location | Responsibility |
| ----- | -------- | -------------- |
| Graph | [packages/graph/src/weatherGraph.ts](../../../packages/graph/src/weatherGraph.ts) | LangGraph ReAct：`agent` ↔ `tools` |
| Tool impl | [packages/tools](../../../packages/tools) | `import { openMeteo } from '@agent/tools'` |
| Server wire-up | [graphs/index.ts](../../../apps/server/src/graphs/index.ts) | `*.compile({ checkpointer })` |

**Do not** put Open-Meteo HTTP logic in `@agent/graph`; keep external APIs in `@agent/tools`.

## Adding a new sample endpoint

1. Implement graph in `packages/graph/src/`.
2. Implement external tools in `packages/tools/` when calling APIs.
3. Add handler on `SampleController` with `@Get(...)`.
4. For streaming: `return createSseResponse(await graphApp.stream(input, { streamMode: 'updates' }))` — [createSseResponse](../../../apps/server/src/utils/sse.ts) wraps errors and `[DONE]`.
5. Client: add route under `apps/client/src/routes/` and lib helper if needed.

## Weather agent

- Env: DeepSeek-compatible settings in `apps/server/.env` — see [`.env.example`](../../../apps/server/.env.example).
- No synchronous `/sample/weather` invoke route — SSE only.
- Client chat UI: [weather.tsx](../../../apps/client/src/routes/weather.tsx), [parseWeatherUpdate.ts](../../../apps/client/src/lib/parseWeatherUpdate.ts).
