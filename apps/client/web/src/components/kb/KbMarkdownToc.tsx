import type { TocItem } from '@agent/markdown'
import type { MouseEvent, RefObject } from 'react'

interface KbMarkdownTocProps {
  toc: TocItem[]
  /** 预览滚动容器，用于 scrollIntoView 定位 */
  scrollRootRef?: RefObject<HTMLElement | null>
  /** 源码等场景：按标题文案导航 */
  onNavigateHeading?: (item: TocItem) => void
  className?: string
}

export function KbMarkdownToc({
  toc,
  scrollRootRef,
  onNavigateHeading,
  className,
}: KbMarkdownTocProps) {
  if (toc.length === 0)
    return null

  function onClick(e: MouseEvent<HTMLAnchorElement>, item: TocItem) {
    e.preventDefault()
    if (onNavigateHeading) {
      onNavigateHeading(item)
      return
    }
    const root = scrollRootRef?.current
    if (!root)
      return
    let el: Element | null = root.querySelector(`#${CSS.escape(item.slug)}`)
    if (!el) {
      const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6')
      el = [...headings].find(h => h.textContent?.trim() === item.text.trim()) ?? null
    }
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      className={`max-h-full self-start overflow-auto border-l border-border py-3 pl-3 text-xs text-muted-foreground ${className ?? ''}`}
      aria-label="目录"
    >
      <p className="mb-2 font-medium text-foreground">目录</p>
      <ul className="space-y-1">
        {toc.map(item => (
          <li
            key={`${item.slug}-${item.level}`}
            style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
          >
            <a
              href={`#${item.slug}`}
              onClick={e => onClick(e, item)}
              className="block truncate hover:text-foreground"
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
