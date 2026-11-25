# HTML 卡片写作规约

调用 `render_code_card` 时，`html` 与 `css` 必须由你本轮现场编写，禁止粘贴某段固定模板全文。

## 硬性契约

- `html`：放入沙箱 `<body>` 的片段；不要写 `<html>` / `<body>` / 外链 `<script src>` / 外链 stylesheet
- `css`：原生 CSS，由宿主注入沙箱 `<style>`；禁止 Tailwind / utility class / CDN
- 禁止 React / JSX / `export default` / `useCardContext` / `import`
- 业务数据只从 `window.__CARD_INFO__` 读取（宿主注入 `info`）；禁止把气温等写死在 html 里
- 需要交互时：用原生 DOM；向宿主发 `parent.postMessage({ type: "card-action", name, payload }, "*")`

## 主题（必守）

- 必须同时提供浅色与深色两套样式，禁止只写一套色值
- 浅色写在 `:root`（或默认选择器）；深色写在 `html.dark`
- 宿主挂载沙箱时按当时外部主题给 `<html>` 一次性加上或不加 `dark`，不做后续随动
- 推荐用 CSS 变量集中色板，再在 `html.dark` 里覆盖变量；不要依赖 `prefers-color-scheme`
- 不要自行给 `<html>` 加 class

## 布局与边距（必守）

- 根节点宽度约聊天气泡内可读宽度（如 max-width: 24rem），内容区至少 padding: 1rem 1.5rem
- 分区之间留白；圆角边框卡片内容不要贴边

## 渲染模式

- 用语义 class + `css` 参数写样式；需要绑定 `__CARD_INFO__` 时，用内联 `<script>` 在片段末尾填充文本（不要外链脚本）

## 示意（结构参考，须按 info 字段自行改写，勿原样提交）

```
html:
<div class="card">
  <div class="card-body">
    <h3 class="card-title" data-field="city"></h3>
    <p class="card-temp" data-field="temperatureC"></p>
    <p class="card-meta" data-field="condition"></p>
  </div>
</div>
<script>
(function () {
  var info = window.__CARD_INFO__ || {};
  document.querySelectorAll("[data-field]").forEach(function (el) {
    var key = el.getAttribute("data-field");
    var value = info[key];
    if (value == null) return;
    el.textContent = key === "temperatureC" ? String(value) + "°C" : String(value);
  });
})();
</script>

css:
:root {
  --card-bg: #ffffff;
  --card-fg: #0f172a;
  --card-muted: #475569;
  --card-border: #e2e8f0;
  --card-shadow: 0 1px 2px rgba(0,0,0,.05);
}
html.dark {
  --card-bg: #0f172a;
  --card-fg: #f8fafc;
  --card-muted: #94a3b8;
  --card-border: #334155;
  --card-shadow: 0 1px 2px rgba(0,0,0,.35);
}
.card { width: 100%; max-width: 24rem; overflow: hidden; border-radius: 1rem; border: 1px solid var(--card-border); background: var(--card-bg); box-shadow: var(--card-shadow); color: var(--card-fg); }
.card-body { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.5rem; }
.card-title { margin: 0; font-size: 1.125rem; font-weight: 600; color: var(--card-fg); }
.card-temp { margin: 0; font-size: 1.875rem; font-weight: 300; color: var(--card-fg); }
.card-meta { margin: 0; font-size: 0.875rem; color: var(--card-muted); }
```
