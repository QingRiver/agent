import type { ReactNode } from 'react'

interface GtdLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  inspector?: ReactNode
}

export function GtdLayout({ sidebar, children, inspector }: GtdLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-65px)]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {inspector}
    </div>
  )
}
