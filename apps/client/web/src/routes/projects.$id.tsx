import { ProjectWorkspace } from '@components/project/ProjectWorkspace'
import { DirStore } from '@stores/dir-store'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'

const projectDetailSearchSchema = z.object({
  text: z.string().optional().catch(undefined),
  dir: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/projects/$id')({
  validateSearch: projectDetailSearchSchema,
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { id } = Route.useParams()
  const { text, dir } = Route.useSearch()
  const dirs = useAtomValue(DirStore.dirsAtom)
  const project = useMemo(
    () => dirs.find(d => d.id === id && d.kind === 'project'),
    [dirs, id],
  )

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Link
          to="/resources"
          search={{ tab: 'project' }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          资源
        </Link>
        <span className="text-sm font-medium text-foreground">
          {project?.name ?? '项目'}
        </span>
      </div>
      <ProjectWorkspace
        key={`${id}:${text ?? ''}:${dir ?? ''}`}
        projectId={id}
        initialTextId={text}
        initialDirId={dir}
      />
    </div>
  )
}
