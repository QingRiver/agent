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
| Graph | [weatherGraph.ts](../../../apps/server/src/graphs/weatherGraph.ts) | LangGraph ReAct：`agent` ↔ `tools` |
| Tool impl | [openMeteo.ts](../../../apps/server/src/tools/openMeteo.ts) | `fetchWeatherByCity` — Open-Meteo 地理编码 + 实况 |
| Tool binding | `weatherGraph.ts` | `tool(...)` + `ToolNode` 注册 `get_weather` |

**Do not** put Open-Meteo HTTP logic in `graphs/`; keep external APIs in `tools/`.

## Adding a new sample endpoint

1. Implement graph in `apps/server/src/graphs/`.
2. Implement Agent tools in `apps/server/src/tools/` when calling external APIs.
3. Add handler on `SampleController` with `@Get(...)`.
4. For streaming: `return createSseResponse(await graphApp.stream(input, { streamMode: 'updates' }))` — [createSseResponse](../../../apps/server/src/utils/sse.ts) wraps errors and `[DONE]`.
5. Client: add route under `apps/client/src/routes/` and lib helper if needed.

## Weather agent

- Env: DeepSeek-compatible settings in `apps/server/.env` — see [`.env.example`](../../../apps/server/.env.example).
- No synchronous `/sample/weather` invoke route — SSE only.
- Client chat UI: [weather.tsx](../../../apps/client/src/routes/weather.tsx), [parseWeatherUpdate.ts](../../../apps/client/src/lib/parseWeatherUpdate.ts).
