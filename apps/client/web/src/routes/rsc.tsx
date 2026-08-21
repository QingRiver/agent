import { RscDemoPage } from '@components/rsc/RscDemoPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/rsc')({
  component: RscDemoPage,
})
