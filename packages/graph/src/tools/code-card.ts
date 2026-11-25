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
      '在对话中用沙箱 iframe 渲染 HTML + 原生 CSS 卡片（禁止 Tailwind / 外链 CDN）。',
      '当需要把结构化数据（天气、订单、统计、检索结果等）以富卡片呈现时调用。',
      '参数 html：body 内 HTML 片段（现场编写，数据从 window.__CARD_INFO__ 读，勿写死）。',
      '参数 css：原生 CSS，宿主注入 <style>；必须含浅色(:root)与深色(html.dark)两套。',
      '参数 info：注入沙箱 window.__CARD_INFO__ 的数据对象（来自对应数据工具，勿臆造）。',
      '详细写作规约见 html_card skill 的 refs/writing-spec.md。',
    ].join(' '),
    schema: z.object({
      html: z.string().min(1).describe('body 内 HTML 片段（现场编写，无 Tailwind）'),
      css: z.string().optional().describe('原生 CSS（:root + html.dark 双主题），注入沙箱 style'),
      info: z.unknown().describe('注入 window.__CARD_INFO__ 的数据对象'),
    }),
  },
)
