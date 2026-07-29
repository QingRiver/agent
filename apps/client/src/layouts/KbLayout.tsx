import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface KbLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  /** 右侧操作区（召回 / 源码 AI 等） */
  rightRail?: ReactNode
  /** 左侧文件树折叠 */
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export function KbLayout({
  sidebar,
  children,
  rightRail,
  sidebarCollapsed = false,
  onToggleSidebar,
}: KbLayoutProps) {
  return (
    <div className="relative flex h-[calc(100vh-65px)]">
      {!sidebarCollapsed && (
        <div className="relative flex h-full shrink-0">
          {sidebar}
          {onToggleSidebar && (
            <button
              type="button"
              title="折叠侧栏"
              aria-label="折叠侧栏"
              onClick={onToggleSidebar}
              className="absolute top-2 right-1 z-10 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>
      )}
      {sidebarCollapsed && onToggleSidebar && (
        <button
          type="button"
          title="展开侧栏"
          aria-label="展开侧栏"
          onClick={onToggleSidebar}
          className="fixed left-0 top-1/2 z-30 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        {children}
      </div>
      {rightRail != null && (
        <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
          {rightRail}
        </aside>
      )}
    </div>
  )
}
