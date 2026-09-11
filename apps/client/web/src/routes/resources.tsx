import { DirSync } from '@components/gtd/DirSync'
import { TagSync } from '@components/gtd/TagSync'
import { ResourcesPage } from '@components/resources/ResourcesPage'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const resourcesSearchSchema = z.object({
  tab: z.enum(['project', 'kb', 'prompt', 'skill', 'tools']).optional().catch('project'),
  q: z.string().optional().catch(undefined),
  /** 多选标签 id，逗号分隔 */
  tag: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/resources')({
  validateSearch: resourcesSearchSchema,
  component: ResourcesRoute,
})

function ResourcesRoute() {
  return (
    <>
      <DirSync />
      <TagSync />
      <ResourcesPage />
    </>
  )
}
