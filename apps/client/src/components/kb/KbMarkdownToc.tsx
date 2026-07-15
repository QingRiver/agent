import type { TocItem } from '@agent/markdown'
import type { MouseEvent, RefObject } from 'react'

interface KbMarkdownTocProps {
  toc: TocItem[]
  /** 预览滚动容器，用于 scrollIntoView 定位 */
  scrollRootRef: RefObject<HTMLElement | null>
  className?: string
}

export function KbMarkdownToc({ toc, scrollRootRef, className }: KbMarkdownTocProps) {
  if (toc.length === 0)
    return null

  function onClick(e: MouseEvent<HTMLAnchorElement>, slug: string) {
    e.preventDefault()
    const root = scrollRootRef.current
    const el = root?.querySelector(`#${CSS.escape(slug)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      className={`max-h-full self-start overflow-auto border-l border-slate-800 py-3 pl-3 text-xs text-slate-400 ${className ?? ''}`}
      aria-label="目录"
    >
      <p className="mb-2 font-medium text-slate-300">目录</p>
      <ul className="space-y-1">
        {toc.map(item => (
          <li
            key={`${item.slug}-${item.level}`}
            style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
          >
            <a
              href={`#${item.slug}`}
              onClick={e => onClick(e, item.slug)}
              className="block truncate hover:text-slate-200"
              title={item.text}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
