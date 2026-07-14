import type { ReactNode } from 'react'

interface KbLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  recall?: ReactNode
}

export function KbLayout({ sidebar, children, recall }: KbLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-65px)]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
        {children}
      </div>
      {recall}
    </div>
  )
}
