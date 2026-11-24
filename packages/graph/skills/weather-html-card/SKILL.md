---
name: weather_html_card
description: 查天气后用 render_code_card 展示 HTML 沙箱卡片；html 须按 HTML 卡片写作规约现场编写
---

# 天气 HTML 卡片

用户询问天气时：

1. 先调用 `get_weather`（禁止编造气温）。
2. 成功（`ok:true`）后立刻调用 `render_code_card`：
   - `info`：`weather` 对象原样
   - `html`：**现场编写**的 body 片段；数据从 `window.__CARD_INFO__` 读
   - `css`：原生 CSS（禁止 Tailwind）；**必须同时写浅色 + 深色**：
     - 浅色：`:root` CSS 变量
     - 深色：`html.dark { ... }` 覆盖同名变量
     - 宿主挂载时按当时主题一次性给 `<html>` 加/不加 `dark`（无后续随动）；不要用 `prefers-color-scheme`
3. 禁止用正文罗列气温代替卡片；卡片后可一两句短总结。
4. `get_weather` 失败时如实告知，不要调用 `render_code_card`。

写作规约与平台 `CODE_CARD_SYSTEM_PROMPT`（HTML 卡片写作规约）一致。
