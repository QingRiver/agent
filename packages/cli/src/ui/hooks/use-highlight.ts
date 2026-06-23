/**
 * useHighlight —— 订阅 getHighlighterPromise，shiki 就绪后触发一次重渲染。
 * 模块级缓存 cached：首条消息加载完成后，后续消息同步拿到非 null 值，不再走异步分支。
 */
import type { BundledLanguage } from 'shiki'
import { useEffect, useState } from 'react'
import { createHighlighter } from 'shiki'

export interface HighlightToken {
  content: string
  color?: string
  fontStyle?: number
}

export interface CodeHighlighter {
  /**
   * 高亮为 token 二维数组(行 × token)。
   * 语言未加载或出错时返回 null，调用方降级为纯文本。
   */
  highlight: (code: string, lang: string) => HighlightToken[][] | null
}

// 预加载常用语言。别名(ts→typescript、sh→bash 等)由 shiki 在 codeToTokens 时解析，
// 故此处列规范 id；未列出的语言 highlight 返回 null 走纯文本降级。
const BUNDLED_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'bash',
  'json',
  'jsonc',
  'yaml',
  'python',
  'go',
  'rust',
  'sql',
  'css',
  'html',
  'markdown',
  'toml',
  'ini',
  'diff',
  'xml',
  'dockerfile',
  'graphql',
] as const

const THEME = 'github-dark'

let highlighterPromise: Promise<CodeHighlighter | null> | undefined

async function loadHighlighter(): Promise<CodeHighlighter | null> {
  try {
    const hl = await createHighlighter({ langs: [...BUNDLED_LANGS], themes: [THEME] })
    return {
      highlight: (code, lang) => {
        try {
          // lang 来自 markdown 围栏，是任意字符串；cast 到 BundledLanguage 后由 try/catch 兜底
          const result = hl.codeToTokens(code, { lang: (lang || 'plaintext') as BundledLanguage, theme: THEME })
          return result.tokens as HighlightToken[][]
        }
        catch {
          // 语言未加载或不支持 → 降级
          return null
        }
      },
    }
  }
  catch {
    return null
  }
}

export function getHighlighterPromise(): Promise<CodeHighlighter | null> {
  highlighterPromise ??= loadHighlighter()
  return highlighterPromise
}

let cached: CodeHighlighter | null | undefined

export function useHighlight(): CodeHighlighter | null {
  const [highlighter, setHighlighter] = useState<CodeHighlighter | null>(cached ?? null)

  useEffect(() => {
    if (cached !== undefined)
      return
    let alive = true
    getHighlighterPromise().then((h) => {
      cached = h
      if (alive)
        setHighlighter(h)
    })
    return () => {
      alive = false
    }
  }, [])

  return highlighter
}
