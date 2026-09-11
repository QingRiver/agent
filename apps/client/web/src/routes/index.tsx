import { DihedralHome } from '@components/home/DihedralHome'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <DihedralHome />
}
