import { ProjectListPage } from '@components/project/ProjectListPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/')({
  component: ProjectListPage,
})
