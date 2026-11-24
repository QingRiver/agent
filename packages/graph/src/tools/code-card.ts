import { tool } from '@langchain/core/tools'
import { z } from 'zod'

/** 须与 client `RENDER_CODE_CARD_TOOL_NAME` 一致 */
export const RENDER_CODE_CARD_TOOL_NAME = 'render_code_card' as const

/**
 * 在对话中渲染 HTML/CSS 沙箱卡片。
 * 后端只回执；前端按 TOOL_CALL args 挂载 iframe srcdoc。
 * `html` / `css` 由模型按 HTML 卡片写作规约现场生成。
 */
export const renderCodeCardTool = tool(
  async ({ html, css, info }) => {
    const keys = info != null && typeof info === 'object' && !Array.isArray(info)
      ? Object.keys(info as Record<string, unknown>).slice(0, 6).join(',')
      : typeof info
    const cssLen = typeof css === 'string' ? css.length : 0
    return `已展示 HTML 卡片（html ${html.length} 字，css ${cssLen} 字，info keys: ${keys || '—'}）`
  },
  {
    name: RENDER_CODE_CARD_TOOL_NAME,
    description: [
      '在对话中用沙箱 iframe 渲染 HTML + 原生 CSS 卡片（禁止 Tailwind）。',
      '参数 html：body 内 HTML 片段（现场编写）。',
      '参数 css：原生 CSS，宿主注入 <style>；必须含浅色(:root)与深色(html.dark)两套；宿主挂载时按当前主题选一套生效。',
      '参数 info：注入沙箱 window.__CARD_INFO__（天气场景用 get_weather 的 weather，勿把气温写进 html）。',
      '查天气成功后优先调用本工具展示卡片，不要用正文罗列气温。',
    ].join(' '),
    schema: z.object({
      html: z.string().min(1).describe('body 内 HTML 片段（现场编写，无 Tailwind）'),
      css: z.string().optional().describe('原生 CSS（:root + html.dark 双主题），注入沙箱 style'),
      info: z.unknown().describe('注入 window.__CARD_INFO__ 的数据对象'),
    }),
  },
)
