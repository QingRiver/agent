import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/sse')({
  beforeLoad: () => {
    throw redirect({ to: '/dev/sse' })
  },
})
