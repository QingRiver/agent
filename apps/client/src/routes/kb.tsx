import { KbEditor } from '@components/kb/KbEditor'
import { KbRecallPanel } from '@components/kb/KbRecallPanel'
import { KbSidebar } from '@components/kb/KbSidebar'
import { KbSync } from '@components/kb/KbSync'
import { KbLayout } from '@layouts/KbLayout'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/kb')({
  component: KbPage,
})

function KbPage() {
  const [recallOpen, setRecallOpen] = useState(false)

  return (
    <>
      <KbSync />
      <KbLayout
        sidebar={(
          <KbSidebar
            recallOpen={recallOpen}
            onToggleRecall={() => setRecallOpen(v => !v)}
          />
        )}
        recall={recallOpen ? <KbRecallPanel onClose={() => setRecallOpen(false)} /> : null}
      >
        <KbEditor />
      </KbLayout>
    </>
  )
}
