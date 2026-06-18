import type { Token, Tokens } from 'marked'
import { Box, Text } from 'ink'
import { marked } from 'marked'
import React, { memo, useMemo, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// configureMarked：禁用 strikethrough —— 模型常把 ~ 当"约等于"(~100)用
// ─────────────────────────────────────────────────────────────────────────────
let markedConfigured = false
function configureMarked(): void {
  if (markedConfigured)
    return
  markedConfigured = true
  marked.use({
    tokenizer: {
      del() {
        return undefined
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 简易 FNV 哈希 —— 原版用 hashContent 避免 key 保留整串(RSS 回归 #24180)
// ─────────────────────────────────────────────────────────────────────────────
function hashContent(s: string): string {
  let h = 0x811C9DC5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// markdown 语法标记；无则跳过 ~3ms 的 marked.lexer，按单段落渲染
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /
function hasMarkdownSyntax(s: string): boolean {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s)
}

// ─────────────────────────────────────────────────────────────────────────────
// cachedLexer：模块级 LRU token 缓存(最多 500 条)，命中即免解析
// 历史消息不可变 → 同内容同 token。滚动回到旧消息不再重复付费 ~3ms。
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_CACHE_MAX = 500
const tokenCache = new Map<string, Token[]>()

function cachedLexer(content: string): Token[] {
  // 快路径：纯文本无 markdown 语法 → 单段落 token，不缓存(单次对象分配)
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: 'paragraph',
      raw: content,
      text: content,
      tokens: [{ type: 'text', raw: content, text: content }],
    }] as Token[]
  }
  const key = hashContent(content)
  const hit = tokenCache.get(key)
  if (hit) {
    // 提升为 MRU，否则 FIFO 会淘汰你正在看的那条
    tokenCache.delete(key)
    tokenCache.set(key, hit)
    return hit
  }
  const tokens = marked.lexer(content)
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value
    if (first !== undefined)
      tokenCache.delete(first)
  }
  tokenCache.set(key, tokens)
  return tokens
}

// ─────────────────────────────────────────────────────────────────────────────
// renderInlineTokens：递归渲染行内 token → React 节点(嵌套 <Text> 样式)
// 对应 formatToken 的 codespan/em/strong/del/link/text/escape/br/html 分支
// ─────────────────────────────────────────────────────────────────────────────
let inlineKey = 0
function renderInlineTokens(
  tokens: Token[] | undefined,
  parent: Token | null = null,
): React.ReactNode[] {
  if (!tokens?.length)
    return []
  const out: React.ReactNode[] = []
  for (const tok of tokens) {
    const k = inlineKey++
    switch (tok.type) {
      case 'text':
        // link 父节点内：原样输出，避免嵌套第二个 OSC8(本版无 hyperlink，仍保持原行为)
        out.push(tok.tokens ? renderInlineTokens(tok.tokens, parent) : tok.text)
        break
      case 'codespan':
        out.push(
          <Text key={k} color="cyan">
            {tok.text}
          </Text>,
        )
        break
      case 'em':
        out.push(
          <Text key={k} italic>
            {renderInlineTokens(tok.tokens, tok)}
          </Text>,
        )
        break
      case 'strong':
        out.push(
          <Text key={k} bold>
            {renderInlineTokens(tok.tokens, tok)}
          </Text>,
        )
        break
      case 'del':
        // 已被 configureMarked 禁用，仍处理以防自定义
        out.push(
          <Text key={k} strikethrough>
            {renderInlineTokens(tok.tokens, tok)}
          </Text>,
        )
        break
      case 'link': {
        if (tok.href.startsWith('mailto:')) {
          out.push(tok.href.replace(/^mailto:/, ''))
          break
        }
        const linkText = renderInlineTokens(tok.tokens, tok)
        const hasText = tok.tokens?.length
        out.push(
          <Text key={k} color="blue" underline>
            {hasText ? linkText : tok.href}
          </Text>,
        )
        break
      }
      case 'br':
        out.push('\n')
        break
      case 'escape':
      case 'html':
        out.push(tok.text)
        break
      default:
        out.push('text' in tok ? (tok as { text?: string }).text ?? '' : '')
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// renderBlockToken：渲染顶层 block token → 一行/一块 React 节点
// 对应 formatToken 的 heading/paragraph/code/blockquote/list/hr/table/space 分支
// ─────────────────────────────────────────────────────────────────────────────

// 简易 CJK/全角感知宽度（原版用 string-width；MVP 内联避免依赖）
function stringWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (
      (c >= 0x1100 && c <= 0x115F)
      || (c >= 0x2E80 && c <= 0x303E)
      || (c >= 0x3041 && c <= 0x33FF)
      || (c >= 0x3400 && c <= 0x4DBF)
      || (c >= 0x4E00 && c <= 0x9FFF)
      || (c >= 0xAC00 && c <= 0xD7A3)
      || (c >= 0xF900 && c <= 0xFAFF)
      || (c >= 0xFE30 && c <= 0xFE4F)
      || (c >= 0xFF00 && c <= 0xFF60)
      || (c >= 0xFFE0 && c <= 0xFFE6)
      || (c >= 0x1F300 && c <= 0x1FAFF)
    ) {
      w += 2
    }
    else {
      w += 1
    }
  }
  return w
}

// 取 token 的纯文本（用于列宽测量，不含样式）
function tokenPlainText(tokens: Token[] | undefined): string {
  if (!tokens)
    return ''
  return tokens.map((t) => {
    switch (t.type) {
      case 'text':
        return t.tokens ? tokenPlainText(t.tokens) : t.text
      case 'codespan':
      case 'escape':
      case 'html':
        return t.text
      case 'em':
      case 'strong':
      case 'del':
      case 'link':
        return tokenPlainText(t.tokens)
      case 'br':
        return ' '
      default:
        return 'text' in t ? (t as { text?: string }).text ?? '' : ''
    }
  }).join('')
}

// MarkdownTable：用 Ink <Box> 固定列宽 + 边框字符，列对齐且保留单元格内联样式
// 原版拼成单个 ANSI 字符串块(防 Ink 行内折行)；本版用 flexbox 列布局等价达成。
function MarkdownTable({ token }: { token: Tokens.Table }): React.ReactNode {
  // 列宽 = 该列最大内容宽度 + 2(左右各 1 padding)
  const colWidths = token.header.map((_, ci) => {
    let w = stringWidth(tokenPlainText(token.header[ci]!.tokens))
    for (const row of token.rows)
      w = Math.max(w, stringWidth(tokenPlainText(row[ci]?.tokens)))
    return w + 2
  })
  const border = (l: string, m: string, c: string, r: string): string =>
    l + colWidths.map(w => m.repeat(w)).join(c) + r

  const alignOf = (ci: number, isHeader: boolean): 'center' | 'flex-start' | 'flex-end' => {
    if (isHeader)
      return 'center'
    const a = token.align?.[ci]
    if (a === 'center')
      return 'center'
    if (a === 'right')
      return 'flex-end'
    return 'flex-start'
  }

  const renderRow = (cells: Tokens.TableCell[], isHeader: boolean): React.ReactNode => (
    <Box flexDirection="row">
      <Text>│</Text>
      {cells.map((cell, ci) => (
        <React.Fragment key={ci}>
          <Box width={colWidths[ci]} paddingLeft={1} paddingRight={1} justifyContent={alignOf(ci, isHeader)}>
            <Text {...(isHeader ? { bold: true } : {})}>{renderInlineTokens(cell.tokens)}</Text>
          </Box>
          <Text>│</Text>
        </React.Fragment>
      ))}
    </Box>
  )

  return (
    <Box flexDirection="column">
      <Text>{border('┌', '─', '┬', '┐')}</Text>
      {renderRow(token.header, true)}
      <Text>{border('├', '─', '┼', '┤')}</Text>
      {token.rows.map((row, ri) => (
        <React.Fragment key={ri}>
          {renderRow(row, false)}
          {ri < token.rows.length - 1 && <Text>{border('├', '─', '┼', '┤')}</Text>}
        </React.Fragment>
      ))}
      <Text>{border('└', '─', '┴', '┘')}</Text>
    </Box>
  )
}

// list_item 的子 token 可能混合行内文本与嵌套 list —— 分别渲染，嵌套层缩进
function ListItem({
  item,
  ordered,
  start,
  index,
  depth,
}: {
  item: Token
  ordered: boolean
  start: number
  index: number
  depth: number
}): React.ReactNode {
  const num = ordered ? start + index : null
  const prefix = `${'  '.repeat(depth)}${num != null ? `${num}. ` : '• '}`
  const inlineParts: React.ReactNode[] = []
  const nestedParts: React.ReactNode[] = []
  for (const t of (item as { tokens?: Token[] }).tokens ?? []) {
    if (t.type === 'list')
      nestedParts.push(renderBlockToken(t, depth + 1))
    else
      inlineParts.push(renderInlineTokens([t], item))
  }
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{prefix}</Text>
        <Text>{inlineParts}</Text>
      </Box>
      {nestedParts}
    </Box>
  )
}
function renderBlockToken(token: Token, listDepth = 0): React.ReactNode {
  const k = `${token.type}-${token.raw?.length ?? 0}`
  switch (token.type) {
    case 'heading': {
      const inline = renderInlineTokens(token.tokens)
      const t = token as Tokens.Heading
      if (t.depth === 1)
        return <Text key={k} bold italic underline>{inline}</Text>
      return <Text key={k} bold>{inline}</Text>
    }
    case 'paragraph':
      return <Text key={k}>{renderInlineTokens(token.tokens)}</Text>
    case 'code': {
      const t = token as Tokens.Code
      return (
        <Box key={k} flexDirection="column">
          {t.lang && (
            <Text dimColor>
              {t.lang}
            </Text>
          )}
          <Text color="cyan">
            {t.text}
          </Text>
        </Box>
      )
    }
    case 'blockquote': {
      const inner = renderInlineTokens(token.tokens)
      return (
        <Box key={k} flexDirection="column">
          <Text>
            <Text dimColor>{'│ '}</Text>
            <Text italic>{inner}</Text>
          </Text>
        </Box>
      )
    }
    case 'list': {
      const t = token as Tokens.List
      return (
        <Box key={k} flexDirection="column">
          {t.items.map((item, i) => (
            <ListItem key={i} item={item} ordered={t.ordered} start={Number(t.start)} index={i} depth={listDepth} />
          ))}
        </Box>
      )
    }
    case 'list_item':
      return renderInlineTokens(token.tokens)
    case 'hr':
      return (
        <Text key={k} dimColor>
          {'─'.repeat(20)}
        </Text>
      )
    case 'table':
      return <MarkdownTable key={k} token={token as Tokens.Table} />
    case 'space':
    case 'br':
      return <Text key={k}>{' '}</Text>
    default:
      return 'text' in token ? <Text key={k}>{(token as { text?: string }).text}</Text> : null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown：稳定渲染。useMemo([children, dimColor]) —— 同内容不重解析
// 表格与非表格内容分别处理；非表格 block 渲染为 <Text> 行。
// ─────────────────────────────────────────────────────────────────────────────
interface MarkdownProps {
  children: string
  dimColor?: boolean
}

export const Markdown = memo(({ children, dimColor }: MarkdownProps) => {
  configureMarked()
  const elements = useMemo(() => {
    const tokens = cachedLexer(children)
    return tokens.map(token => renderBlockToken(token))
  }, [children])

  return (
    <Box flexDirection="column" gap={0}>
      {elements.map((el, i) => (
        <Box key={i} {...(dimColor != null ? { dimColor } : {})}>
          {el}
        </Box>
      ))}
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// StreamingMarkdown：流式渲染，在最后一个顶层 block 边界切分
//   stablePrefix：memoized，永不重解析
//   unstableSuffix：每 delta 重解析（仅最后一个 block）
// boundary 单调递增 → render 期间 ref 变更是幂等的，StrictMode 双渲染安全。
// ─────────────────────────────────────────────────────────────────────────────
interface StreamingProps {
  children: string
}

export function StreamingMarkdown({ children }: StreamingProps): React.ReactNode {
  configureMarked()
  const stripped = children // 原版在此 stripPromptXMLTags；MVP 直通
  const stablePrefixRef = useRef('')

  // 文本被替换时重置(防御性；正常由 unmount 处理)
  if (!stripped.startsWith(stablePrefixRef.current))
    stablePrefixRef.current = ''

  // 只从当前 boundary 起 lex —— O(unstable 长度) 而非 O(全文)
  const boundary = stablePrefixRef.current.length
  const tokens = marked.lexer(stripped.substring(boundary))

  // 最后一个非 space token 是增长中的 block；其前全部 final
  let lastContentIdx = tokens.length - 1
  while (lastContentIdx >= 0 && tokens[lastContentIdx]!.type === 'space')
    lastContentIdx--
  let advance = 0
  for (let i = 0; i < lastContentIdx; i++)
    advance += tokens[i]!.raw.length
  if (advance > 0)
    stablePrefixRef.current = stripped.substring(0, boundary + advance)

  const stablePrefix = stablePrefixRef.current
  const unstableSuffix = stripped.substring(stablePrefix.length)

  return (
    <Box flexDirection="column" gap={0}>
      {stablePrefix && <Markdown>{stablePrefix}</Markdown>}
      {unstableSuffix && <Markdown>{unstableSuffix}</Markdown>}
    </Box>
  )
}
