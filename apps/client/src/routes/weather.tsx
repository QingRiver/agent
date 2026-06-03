import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'

export const Route = createFileRoute('/weather')({
  component: WeatherLayout,
})

function WeatherLayout() {
  const pathname = useRouterState({ select: s => s.location.pathname })
  const isSse = pathname === '/weather/sse'

  return (
    <div>
      <div className="mx-auto flex max-w-3xl gap-2 border-b border-slate-800 px-4 pt-3">
        <Link
          to="/weather"
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            !isSse
              ? 'bg-slate-800 text-emerald-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          AG-UI
        </Link>
        <Link
          to="/weather/sse"
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            isSse
              ? 'bg-slate-800 text-emerald-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          SSE
        </Link>
      </div>
      <Outlet />
    </div>
  )
}
