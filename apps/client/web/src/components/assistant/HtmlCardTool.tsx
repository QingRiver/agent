import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useMemo } from 'react'
import { HtmlCardSandbox } from './HtmlCardSandbox'

function HtmlCardSkeleton() {
  return (
    <div className="my-2 h-36 max-w-sm animate-pulse rounded-xl border border-border bg-muted" />
  )
}

function readHtml(args: Record<string, unknown> | undefined): string | null {
  const html = args?.html
  return typeof html === 'string' && html.trim() ? html : null
}

function readCss(args: Record<string, unknown> | undefined): string | undefined {
  const css = args?.css
  return typeof css === 'string' && css.trim() ? css : undefined
}

/** 后端 `render_code_card`：args 齐了再挂 HTML 沙箱，流式未齐时出骨架。 */
export function HtmlCardToolRender({
  args,
  status,
}: ToolCallMessagePartProps<Record<string, unknown>>) {
  const html = readHtml(args)
  const css = readCss(args)
  const info = useMemo(() => args?.info ?? {}, [args?.info])

  if (html == null || status.type === 'running')
    return <HtmlCardSkeleton />

  return <HtmlCardSandbox html={html} css={css} info={info} />
}
