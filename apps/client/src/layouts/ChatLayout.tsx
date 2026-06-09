import type { ReactNode } from 'react'

interface ChatLayoutProps {
  sidebar?: ReactNode
  children: ReactNode
}

export function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  if (sidebar == null) {
    return (
      <div className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col p-6">
        {children}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-65px)]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
        {children}
      </div>
    </div>
  )
}
