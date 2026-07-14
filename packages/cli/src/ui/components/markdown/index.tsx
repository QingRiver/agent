import type { CodeHighlighter, HighlightToken } from '@ui/hooks/use-highlight'
import type { Token, Tokens } from 'marked'
import { Box, Text } from 'ink'
import { marked } from 'marked'
import React, { memo, useMemo, useRef } from 'react'
import stringWidth from 'string-width'

import { MarkdownLink } from './link'

// codespan(行内代码)颜色 —— 移植自 Claude Code dark theme 的 permission 色
// rgb(177,185,249) → #b1b9f9（Ink <Text color> 不解析 rgb() 字符串）
const CODESPAN_COLOR = '#b1b9f9'

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

// 渲染上下文：透传代码高亮器，等价于原版 formatToken 的 (theme, highlight) 入参
interface RenderCtx {
  highlight: CodeHighlighter | null
}

// ─────────────────────────────────────────────────────────────────────────────
// renderInlineTokens：递归渲染行内 token → React 节点(嵌套 <Text> 样式)
// 对应 formatToken 的 codespan/em/strong/del/link/text/escape/br/html 分支
// ─────────────────────────────────────────────────────────────────────────────
let inlineKey = 0
function renderInlineTokens(
  tokens: Token[] | undefined,
  parent: Token | null,
  ctx: RenderCtx,
): React.ReactNode[] {
  if (!tokens?.length)
    return []
  const out: React.ReactNode[] = []
  for (const tok of tokens) {
    const k = inlineKey++
    switch (tok.type) {
      case 'text':
        // link 父节点内：原样/递归输出，避免嵌套第二个 OSC8（终端只认最内层，会覆盖真实 href）
        if (parent?.type === 'link') {
          out.push(tok.tokens ? renderInlineTokens(tok.tokens, parent, ctx) : tok.text)
          break
        }
        // 有子 token 则递归保留嵌套格式，否则原样输出文本
        out.push(tok.tokens ? renderInlineTokens(tok.tokens, parent, ctx) : tok.text)
        break
      case 'codespan':
        out.push(
          <Text key={k} color={CODESPAN_COLOR}>
            {tok.text}
          </Text>,
        )
        break
      case 'em':
        out.push(
          <Text key={k} italic>
            {renderInlineTokens(tok.tokens, tok, ctx)}
          </Text>,
        )
        break
      case 'strong':
        out.push(
          <Text key={k} bold>
            {renderInlineTokens(tok.tokens, tok, ctx)}
          </Text>,
        )
        break
      case 'del':
        // 已被 configureMarked 禁用，仍处理以防自定义
        out.push(
          <Text key={k} strikethrough>
            {renderInlineTokens(tok.tokens, tok, ctx)}
          </Text>,
        )
        break
      case 'link': {
        if (tok.href.startsWith('mailto:')) {
          out.push(tok.href.replace(/^mailto:/, ''))
          break
        }
        const linkNodes = renderInlineTokens(tok.tokens, tok, ctx)
        const hasText = tok.tokens?.length
        out.push(
          <MarkdownLink key={k} href={tok.href}>
            {hasText ? linkNodes : tok.href}
          </MarkdownLink>,
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
// 原版拼成单个 ANSI 字符串块(<Ansi>)防 Ink 行内折行；本版用 flexbox 列布局等价达成。
function MarkdownTable({ token, ctx }: { token: Tokens.Table, ctx: RenderCtx }): React.ReactNode {
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

  const renderRow = (cells: Tokens.TableCell[], isHeader: boolean, rowKey: string): React.ReactNode => {
    const cols = cells.map((cell, ci) => ({
      id: `${rowKey}-c${ci}-${hashContent(tokenPlainText(cell.tokens))}`,
      cell,
      ci,
    }))
    return (
      <Box flexDirection="row">
        <Text>│</Text>
        {cols.map(({ id, cell, ci }) => (
          <React.Fragment key={id}>
            <Box width={colWidths[ci]} paddingLeft={1} paddingRight={1} justifyContent={alignOf(ci, isHeader)}>
              <Text {...(isHeader ? { bold: true } : {})}>{renderInlineTokens(cell.tokens, null, ctx)}</Text>
            </Box>
            <Text>│</Text>
          </React.Fragment>
        ))}
      </Box>
    )
  }

  const rows = token.rows.map((row, ri) => ({
    id: `r${ri}-${hashContent(row.map(c => tokenPlainText(c.tokens)).join('|'))}`,
    row,
    ri,
  }))

  return (
    <Box flexDirection="column">
      <Text>{border('┌', '─', '┬', '┐')}</Text>
      {renderRow(token.header, true, 'h')}
      <Text>{border('├', '─', '┼', '┤')}</Text>
      {rows.map(({ id, row, ri }) => (
        <React.Fragment key={id}>
          {renderRow(row, false, id)}
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
  ctx,
}: {
  item: Token
  ordered: boolean
  start: number
  index: number
  depth: number
  ctx: RenderCtx
}): React.ReactNode {
  const num = ordered ? start + index : null
  const prefix = `${'  '.repeat(depth)}${num != null ? `${num}. ` : '• '}`
  const inlineParts: React.ReactNode[] = []
  const nestedParts: React.ReactNode[] = []
  for (const t of (item as { tokens?: Token[] }).tokens ?? []) {
    if (t.type === 'list')
      nestedParts.push(renderBlockToken(t, ctx, depth + 1))
    else
      inlineParts.push(renderInlineTokens([t], item, ctx))
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
// CodeTokens：shiki token 二维数组 → Ink <Text color={hex}> 片段。
// fontStyle 位掩码：1=italic 2=bold 4=underline。空行渲染一个空格保高度。
function CodeTokens({ tokens }: { tokens: HighlightToken[][] }): React.ReactNode {
  const lines = tokens.map((line, i) => ({
    id: `L${i}-${hashContent(line.map(t => t.content).join(''))}`,
    parts: line.map((t, j) => ({ id: `L${i}T${j}-${hashContent(t.content)}`, t })),
  }))
  return (
    <Box flexDirection="column">
      {lines.map(({ id, parts }) => (
        <Text key={id}>
          {parts.length === 0
            ? ' '
            : parts.map(({ id: partId, t }) => {
                const props: {
                  color?: string
                  italic?: boolean
                  bold?: boolean
                  underline?: boolean
                } = {}
                if (t.color)
                  props.color = t.color
                if (t.fontStyle) {
                  if (t.fontStyle & 1)
                    props.italic = true
                  if (t.fontStyle & 2)
                    props.bold = true
                  if (t.fontStyle & 4)
                    props.underline = true
                }
                return (
                  <Text key={partId} {...props}>
                    {t.content}
                  </Text>
                )
              })}
        </Text>
      ))}
    </Box>
  )
}

function renderBlockToken(token: Token, ctx: RenderCtx, listDepth = 0): React.ReactNode {
  const k = `${token.type}-${token.raw?.length ?? 0}`
  switch (token.type) {
    case 'heading': {
      const inline = renderInlineTokens(token.tokens, null, ctx)
      const t = token as Tokens.Heading
      if (t.depth === 1)
        return <Text key={k} bold italic underline>{inline}</Text>
      return <Text key={k} bold>{inline}</Text>
    }
    case 'paragraph':
      return <Text key={k}>{renderInlineTokens(token.tokens, null, ctx)}</Text>
    case 'code': {
      const t = token as Tokens.Code
      // shiki 异步加载/语言不支持时返回 null → 降级主题色纯文本
      const tokens = ctx.highlight?.highlight(t.text, t.lang || 'plaintext') ?? null
      return (
        <Box key={k} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          {t.lang && (
            <Text dimColor>
              {t.lang}
            </Text>
          )}
          {tokens !== null
            ? <CodeTokens tokens={tokens} />
            : (
                <Text color={CODESPAN_COLOR}>{t.text}</Text>
              )}
        </Box>
      )
    }
    case 'blockquote': {
      const inner = renderInlineTokens(token.tokens, null, ctx)
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
      const items = t.items.map((item, i) => ({
        id: `li${i}-${hashContent(item.raw ?? String(i))}`,
        item,
        i,
      }))
      return (
        <Box key={k} flexDirection="column">
          {items.map(({ id, item, i }) => (
            <ListItem key={id} item={item} ordered={t.ordered} start={Number(t.start)} index={i} depth={listDepth} ctx={ctx} />
          ))}
        </Box>
      )
    }
    case 'list_item':
      return renderInlineTokens(token.tokens, null, ctx)
    case 'hr':
      return (
        <Text key={k} dimColor>
          {'─'.repeat(20)}
        </Text>
      )
    case 'table':
      return <MarkdownTable key={k} token={token as Tokens.Table} ctx={ctx} />
    case 'space':
    case 'br':
      return <Text key={k}>{' '}</Text>
    default:
      return 'text' in token ? <Text key={k}>{(token as { text?: string }).text}</Text> : null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown：稳定渲染。useMemo([children, dimColor, highlight]) —— 同内容+同高亮态不重解析
// 表格与非表格内容分别处理；非表格 block 渲染为 <Text> 行。
// ─────────────────────────────────────────────────────────────────────────────
interface MarkdownProps {
  children: string
  dimColor?: boolean
  highlight: CodeHighlighter | null
}

export const Markdown = memo(({ children, dimColor, highlight }: MarkdownProps) => {
  configureMarked()
  const elements = useMemo(() => {
    const tokens = cachedLexer(children)
    const ctx: RenderCtx = { highlight }
    return tokens.map((token, i) => ({
      id: `${token.type}-${i}-${hashContent(token.raw ?? '')}`,
      node: renderBlockToken(token, ctx),
    }))
  }, [children, highlight])

  return (
    <Box flexDirection="column" gap={0}>
      {elements.map(({ id, node }) => (
        <Box key={id} {...(dimColor != null ? { dimColor } : {})}>
          {node}
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
  highlight: CodeHighlighter | null
}

export function StreamingMarkdown({ children, highlight }: StreamingProps): React.ReactNode {
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
      {stablePrefix && <Markdown highlight={highlight}>{stablePrefix}</Markdown>}
      {unstableSuffix && <Markdown highlight={highlight}>{unstableSuffix}</Markdown>}
    </Box>
  )
}
