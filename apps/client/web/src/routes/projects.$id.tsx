import { ProjectWorkspace } from '@components/project/ProjectWorkspace'
import { DirStore } from '@stores/dir-store'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'

export const Route = createFileRoute('/projects/$id')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { id } = Route.useParams()
  const dirs = useAtomValue(DirStore.dirsAtom)
  const project = useMemo(
    () => dirs.find(d => d.id === id && d.kind === 'project'),
    [dirs, id],
  )

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          项目列表
        </Link>
        <span className="text-sm font-medium text-foreground">
          {project?.name ?? '项目'}
        </span>
      </div>
      <ProjectWorkspace key={id} projectId={id} />
    </div>
  )
}
