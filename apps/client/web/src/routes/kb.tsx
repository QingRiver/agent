import { DirSync } from '@components/gtd/DirSync'
import { TagSync } from '@components/gtd/TagSync'
import { KbEditor } from '@components/kb/KbEditor'
import { KbRecallPanel } from '@components/kb/KbRecallPanel'
import { KbSidebar } from '@components/kb/KbSidebar'
import { KbSourceChatPanel } from '@components/kb/KbSourceChatPanel'
import { KbSync } from '@components/kb/KbSync'
import { KbLayout } from '@layouts/KbLayout'
import { DirStore } from '@stores/dir-store'
import { KbStore } from '@stores/kb-store'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

const LS_SIDEBAR_COLLAPSED = 'kb.sidebarCollapsed'

const kbSearchSchema = z.object({
  doc: z.string().optional(),
  chunk: z.string().optional(),
  kb: z.string().optional(),
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
  const { doc, kb } = Route.useSearch()
  const dirsById = useAtomValue(DirStore.dirsByIdAtom)

  const projectId = useMemo(
    () => (kb ? DirStore.projectOf(dirsById, kb) : null),
    [dirsById, kb],
  )

  useEffect(() => {
    if (kb)
      KbStore.setWorkingDirId(kb)
  }, [kb])

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
      <TagSync />
      {kb && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
          {projectId
            ? (
                <Link
                  to="/projects/$id"
                  params={{ id: projectId }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  返回项目
                </Link>
              )
            : (
                <Link
                  to="/resources"
                  search={{ tab: 'project' }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  资源
                </Link>
              )}
          <span className="text-sm text-muted-foreground">知识库</span>
        </div>
      )}
      <KbLayout
        sidebar={(
          <KbSidebar
            recallOpen={recallOpen}
            onToggleRecall={() => setRecallOpen(v => !v)}
            focusKbDirId={kb}
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
