import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/agui')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
