import { DirSync } from '@components/gtd/DirSync'
import { KbEditor } from '@components/kb/KbEditor'
import { KbRecallPanel } from '@components/kb/KbRecallPanel'
import { KbSidebar } from '@components/kb/KbSidebar'
import { KbSourceChatPanel } from '@components/kb/KbSourceChatPanel'
import { KbSync } from '@components/kb/KbSync'
import { KbLayout } from '@layouts/KbLayout'
import { KbStore } from '@stores/kb-store'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const LS_SIDEBAR_COLLAPSED = 'kb.sidebarCollapsed'

const kbSearchSchema = z.object({
  doc: z.string().optional(),
  chunk: z.string().optional(),
})

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_SIDEBAR_COLLAPSED) === '1'
  }
  catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(LS_SIDEBAR_COLLAPSED, collapsed ? '1' : '0')
  }
  catch { /* ignore */ }
}

export const Route = createFileRoute('/kb')({
  validateSearch: (search: Record<string, unknown>) => kbSearchSchema.parse(search),
  component: KbPage,
})

function KbPage() {
  const [recallOpen, setRecallOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const { doc } = Route.useSearch()

  useEffect(() => {
    let cancelled = false

    async function selectRouteDocument() {
      if (doc && !cancelled)
        KbStore.select(doc)
    }

    void selectRouteDocument()
    return () => {
      cancelled = true
    }
  }, [doc])

  function onToggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writeSidebarCollapsed(next)
      return next
    })
  }

  const rightRail = sourceMode
    ? <KbSourceChatPanel />
    : recallOpen
      ? <KbRecallPanel onClose={() => setRecallOpen(false)} />
      : null

  return (
    <>
      <KbSync />
      <DirSync />
      <KbLayout
        sidebar={(
          <KbSidebar
            recallOpen={recallOpen}
            onToggleRecall={() => setRecallOpen(v => !v)}
          />
        )}
        rightRail={rightRail}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      >
        <KbEditor onSourceModeChange={setSourceMode} />
      </KbLayout>
    </>
  )
}
