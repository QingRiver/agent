---
name: weather
description: 查天气：调 get_weather 取真实数据（Open-Meteo），再调 render_code_card 展示 HTML 沙箱卡片
---

# 天气

用户询问天气时：

1. 先调用 `get_weather`（禁止编造气温）。
2. 成功（`ok:true`）后立刻调用 `render_code_card`：
   - `info`：`weather` 对象原样（注入沙箱 `window.__CARD_INFO__`）。
   - `html`：按 HTML 卡片写作规约现场编写，数据从 `window.__CARD_INFO__` 读，禁止把气温写死。
3. 禁止用正文罗列气温代替卡片；卡片后可一两句短总结。
4. `get_weather` 失败时如实告知，不要调用 `render_code_card`。

## 绑定

- 数据工具 `get_weather`：本 skill 声明（`scripts/weather.mjs` 自包含取 Open-Meteo，无外部包依赖，可被其他 agent 直接运行）。
- 展示工具 `render_code_card`：平台工具，写作规约见 `html_card` skill。
