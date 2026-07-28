import { AgentLabPage } from '@components/agent-lab/AgentLabPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/agent-lab')({
  component: AgentLabPage,
})
