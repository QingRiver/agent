import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/weather')({
  component: WeatherLayout,
})

function WeatherLayout() {
  return <Outlet />
}
