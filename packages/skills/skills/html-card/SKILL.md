---
name: html_card
description: 把结构化数据（查询结果、统计、状态等）渲染成 HTML 沙箱卡片；按写作规约现场编写 html/css
---

# HTML 卡片

当需要向用户呈现结构化数据（天气、订单、检索摘要、统计指标等）且适合用富卡片展示时：

1. 先通过对应工具拿到数据（`get_weather` / `fetch_user_order` / `kb_search` 等），禁止编造。
2. 成功后调用 `render_code_card`：
   - `info`：数据对象原样（注入沙箱 `window.__CARD_INFO__`）。
   - `html`：现场编写的 `<body>` 内片段；数据从 `window.__CARD_INFO__` 读，禁止把数据写死在 html 里。
   - `css`：原生 CSS（禁止 Tailwind / CDN）；必须同时写浅色（`:root`）与深色（`html.dark`）两套。
3. 卡片后可跟一两句短总结；不要用正文罗列数据代替卡片。
4. 数据获取失败时如实告知，不要调用 `render_code_card`。

## 绑定

- 工具名 `render_code_card`（宿主注入沙箱 iframe srcdoc，后端仅回执）。
- 数据工具因场景而异：天气用 `get_weather`，订单用 `fetch_user_order`，知识库用 `kb_search`。
- 详细写作规约见 `refs/writing-spec.md`（调用 `read_skill_file` 读取，或在内置场景下已随正文注入）。
