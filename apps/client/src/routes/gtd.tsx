import { GtdInspector } from '@components/gtd/GtdInspector'
import { GtdSidebar } from '@components/gtd/GtdSidebar'
import { GtdSync } from '@components/gtd/GtdSync'
import { GtdTaskList } from '@components/gtd/GtdTaskList'
import { GtdLayout } from '@layouts/GtdLayout'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/gtd')({
  component: GtdPage,
})

function GtdPage() {
  return (
    <>
      <GtdSync />
      <GtdLayout
        sidebar={<GtdSidebar />}
        inspector={<GtdInspector />}
      >
        <GtdTaskList />
      </GtdLayout>
    </>
  )
}
