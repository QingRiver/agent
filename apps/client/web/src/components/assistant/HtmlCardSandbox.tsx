import type { CardTheme } from './htmlCardConstants'
import { ThemeStore } from '@stores/theme-store'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CARD_RESIZE_TYPE } from './htmlCardConstants'

export interface HtmlCardSandboxProps {
  html: string
  css?: string
  info?: unknown
}

function escapeForScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildSrcDoc(
  html: string,
  css: string | undefined,
  info: unknown,
  theme: CardTheme,
): string {
  const infoJson = escapeForScriptJson(info ?? {})
  const extraCss = css?.trim() ? `\n${css.trim()}\n` : ''
  const htmlClass = theme === 'dark' ? ' class="dark"' : ''
  return `<!DOCTYPE html>
<html lang="zh-CN"${htmlClass}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body { padding: 0; }
    ${extraCss}
  </style>
</head>
<body>
<script>window.__CARD_INFO__ = ${infoJson};<\/script>
${html}
<script>
  (function () {
    function postHeight() {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.offsetHeight
      );
      parent.postMessage({ type: '${CARD_RESIZE_TYPE}', height: h }, '*');
    }
    postHeight();
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(postHeight);
      ro.observe(document.body);
      ro.observe(document.documentElement);
    }
    window.addEventListener('load', postHeight);
    setTimeout(postHeight, 50);
    setTimeout(postHeight, 300);
  })();
<\/script>
</body>
</html>`
}

/** HTML/CSS 沙箱：srcdoc 注入 css；挂载时按宿主当前主题写一次 `html.dark`，不做主题随动。 */
export function HtmlCardSandbox({ html, css, info }: HtmlCardSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const [theme] = useState<CardTheme>(() => (ThemeStore.isDark() ? 'dark' : 'light'))

  const srcDoc = useMemo(
    () => buildSrcDoc(html, css, info, theme),
    [html, css, info, theme],
  )

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data
      if (data == null || typeof data !== 'object')
        return
      if ((data as { type?: unknown }).type !== CARD_RESIZE_TYPE)
        return
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow)
        return
      const next = (data as { height?: unknown }).height
      if (typeof next === 'number' && Number.isFinite(next) && next > 0)
        setHeight(Math.ceil(next))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <iframe
      ref={iframeRef}
      title="HTML card"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className="my-2 block w-full min-w-[18rem] max-w-sm border-0 bg-transparent"
      style={{ height }}
    />
  )
}
