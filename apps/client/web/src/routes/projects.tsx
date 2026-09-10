import { DirSync } from '@components/gtd/DirSync'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/projects')({
  component: ProjectsLayout,
})

function ProjectsLayout() {
  return (
    <>
      <DirSync />
      <Outlet />
    </>
  )
}
